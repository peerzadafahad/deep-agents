import os, time, threading, json, subprocess
from fastapi import FastAPI
from supabase import create_client, Client
import openai

app = FastAPI()

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
VERCEL_DEPLOY_HOOK = os.getenv("VERCEL_DEPLOY_HOOK", "")

deepseek = openai.OpenAI(api_key=DEEPSEEK_API_KEY, base_url="https://api.deepseek.com")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

AGENT_PROMPTS = {
    "Builder": (
        "You are the Builder Agent, a meta‑AI that creates and manages other AI agents. "
        "You have access to tools: create_file, run_git_command, trigger_vercel_deploy, update_agent_registry. "
        "When asked to build an agent, generate the code, use the tools to implement and deploy it. Confirm completion."
    ),
    "Writer": "You are a professional copywriter. Write compelling copy.",
    "Developer": "You are an expert full‑stack developer. Provide clean, production‑ready code.",
    "Designer": "You are a creative UI/UX designer. Generate design briefs and component ideas.",
    "Animator": "You are a motion designer. Create animation specs.",
    "Google Marketer": "You are a Google Ads and SEO expert. Analyze and suggest optimisations.",
    "Social Marketer": "You are a social media strategist. Create engaging posts.",
    "Support": "You are a customer support agent. Draft helpful replies.",
    "Tester": "You are a QA engineer. Write tests and review code.",
    "Accountant": "You are a financial analyst. Track budgets and generate invoices."
}

def create_file(path, content):
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w') as f:
            f.write(content)
        return f"File {path} created."
    except Exception as e:
        return f"Error: {str(e)}"

def run_git_command(command):
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        return result.stdout + result.stderr
    except Exception as e:
        return f"Error: {str(e)}"

def trigger_vercel_deploy():
    if not VERCEL_DEPLOY_HOOK:
        return "Vercel deploy hook not set."
    import requests
    try:
        res = requests.post(VERCEL_DEPLOY_HOOK)
        return f"Deploy triggered: {res.status_code}"
    except Exception as e:
        return f"Error: {str(e)}"

def update_agent_registry(name, capabilities):
    try:
        supabase.table("agents").insert({"name": name, "role": capabilities, "progress": 0}).execute()
        return f"Agent '{name}' registered."
    except Exception as e:
        return f"Error: {str(e)}"

FUNCTION_MAP = {
    "create_file": create_file,
    "run_git_command": run_git_command,
    "trigger_vercel_deploy": trigger_vercel_deploy,
    "update_agent_registry": update_agent_registry,
}

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "create_file",
            "description": "Create or overwrite a file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"}
                },
                "required": ["path", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "run_git_command",
            "description": "Run a git command.",
            "parameters": {
                "type": "object",
                "properties": {"command": {"type": "string"}},
                "required": ["command"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "trigger_vercel_deploy",
            "description": "Trigger a Vercel deployment via deploy hook.",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_agent_registry",
            "description": "Register a new agent in the database.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "capabilities": {"type": "string"}
                },
                "required": ["name", "capabilities"]
            }
        }
    }
]

def process_task(task_id, agent_type, input_text):
    print(f"Processing {task_id} ({agent_type})", flush=True)
    system_prompt = AGENT_PROMPTS.get(agent_type, "You are a helpful assistant.")
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": input_text}
    ]
    try:
        response = deepseek.chat.completions.create(
            model="deepseek-chat",
            messages=messages,
            tools=TOOLS,
            tool_choice="auto"
        )
        msg = response.choices[0].message
        while msg.tool_calls:
            messages.append(msg)
            for tool_call in msg.tool_calls:
                func_name = tool_call.function.name
                args = json.loads(tool_call.function.arguments)
                result = FUNCTION_MAP[func_name](**args)
                messages.append({"role": "tool", "tool_call_id": tool_call.id, "content": result})
            response = deepseek.chat.completions.create(
                model="deepseek-chat",
                messages=messages,
                tools=TOOLS,
                tool_choice="auto"
            )
            msg = response.choices[0].message
        final_output = msg.content or "Task completed."
        supabase.table("agent_tasks").update({
            "status": "in_review",
            "output_text": final_output
        }).eq("id", task_id).execute()
        supabase.table("agent_logs").insert({
            "task_id": task_id,
            "model_used": "deepseek-chat",
            "tokens_used": response.usage.total_tokens,
            "cost": response.usage.total_tokens * 0.00000014
        }).execute()
    except Exception as e:
        print(f"Error processing task {task_id}: {e}", flush=True)
        supabase.table("agent_tasks").update({
            "status": "failed",
            "output_text": str(e)
        }).eq("id", task_id).execute()

def task_poller():
    print("Poller started.", flush=True)
    while True:
        try:
            res = supabase.table("agent_tasks").select("*").eq("status", "ai_processing").limit(1).execute()
            if res.data:
                task = res.data[0]
                process_task(task["id"], task["agent_type"], task["input_text"])
        except Exception as e:
            print(f"Poll error: {e}", flush=True)
        time.sleep(5)

@app.on_event("startup")
def startup():
    threading.Thread(target=task_poller, daemon=True).start()

@app.get("/")
def root():
    return {"status": "AiM Worker running"}

@app.get("/health")
def health():
    return {"status": "healthy"}