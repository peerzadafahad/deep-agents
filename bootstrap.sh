#!/bin/bash
set -e

echo "========================================"
echo "  AiM Bootstrap (Simple)"
echo "========================================"
echo ""

# Verify keys
for var in DEEPSEEK_API_KEY SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY GITHUB_TOKEN VERCEL_TOKEN RENDER_API_KEY; do
  if [ -z "${!var}" ]; then
    echo "❌ $var is not set."
    exit 1
  fi
done
echo "✅ All keys present."

# Create Builder page
echo "📱 Creating Builder interface..."
mkdir -p src/app/builder

cat > src/app/builder/page.tsx << 'PAGE_EOF'
'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export default function BuilderPage() {
  const [input, setInput] = useState('');
  const [responses, setResponses] = useState<{role:'you'|'builder', text:string}[]>([]);
  const [listening, setListening] = useState(false);

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return alert('Speech not supported');
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.start();
    setListening(true);
  };

  const sendCommand = async (command: string) => {
    if (!command.trim()) return;
    setResponses(prev => [...prev, {role:'you', text:command}]);
    setInput('');

    const { data, error } = await supabase
      .from('agent_tasks')
      .insert({ agent_type: 'Builder', input_text: command, status: 'ai_processing' })
      .select('id')
      .single();

    if (error) {
      setResponses(prev => [...prev, {role:'builder', text:`❌ ${error.message}`}]);
      return;
    }

    const taskId = data.id;
    let attempts = 0;
    const check = setInterval(async () => {
      attempts++;
      const { data: task } = await supabase
        .from('agent_tasks')
        .select('status, output_text')
        .eq('id', taskId)
        .single();

      if (task?.status === 'in_review') {
        clearInterval(check);
        setResponses(prev => [...prev, {role:'builder', text: task.output_text || '(done)'}]);
      } else if (task?.status === 'failed') {
        clearInterval(check);
        setResponses(prev => [...prev, {role:'builder', text: `❌ Failed: ${task.output_text}`}]);
      } else if (attempts > 20) {
        clearInterval(check);
        setResponses(prev => [...prev, {role:'builder', text:'⏰ Timeout'}]);
      }
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8">
      <div className="max-w-2xl mx-auto flex flex-col h-[90vh]">
        <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent">
          🤖 AiM Builder Agent
        </h1>
        <p className="text-gray-400 mb-4 text-sm">Speak or type to command your AI agency.</p>
        <div className="flex-1 overflow-y-auto border border-gray-700 rounded-xl p-4 mb-4 space-y-3 bg-gray-900/50">
          {responses.length === 0 && (
            <div className="text-gray-500 text-center mt-20">Try: "Builder, create a social media agent"</div>
          )}
          {responses.map((r, i) => (
            <div key={i} className={`flex ${r.role === 'you' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-4 py-2 rounded-2xl whitespace-pre-wrap ${
                r.role === 'you' ? 'bg-indigo-600' : 'bg-gray-700'
              }`}>
                {r.text}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={startListening} className={`p-3 rounded-full ${listening ? 'bg-red-600 animate-pulse' : 'bg-gray-700 hover:bg-gray-600'}`}>
            🎤
          </button>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendCommand(input)}
            placeholder="Type a command..."
            className="flex-1 bg-gray-800 border border-gray-600 rounded-full px-5 py-3 focus:outline-none focus:border-indigo-400"
          />
          <button onClick={() => sendCommand(input)} className="bg-indigo-600 hover:bg-indigo-500 px-6 py-3 rounded-full font-medium">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
PAGE_EOF

# Create Python worker
echo "🧠 Creating worker..."
mkdir -p worker

cat > worker/requirements.txt << 'REQ_EOF'
fastapi>=0.110.0
uvicorn[standard]>=0.27.1
supabase>=2.0.0
openai>=1.12.0
python-dotenv>=1.0.0
httpx>=0.27.0
REQ_EOF

cat > worker/main.py << 'PY_EOF'
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
        with open(path, 'w') as f: f.write(content)
        return f"File {path} created."
    except Exception as e:
        return str(e)

def run_git_command(command):
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        return result.stdout + result.stderr
    except Exception as e:
        return str(e)

def trigger_vercel_deploy():
    if not VERCEL_DEPLOY_HOOK:
        return "Vercel deploy hook not set."
    import requests
    try:
        res = requests.post(VERCEL_DEPLOY_HOOK)
        return f"Deploy triggered: {res.status_code}"
    except Exception as e:
        return str(e)

def update_agent_registry(name, capabilities):
    try:
        supabase.table("agents").insert({"name": name, "role": capabilities, "progress": 0}).execute()
        return f"Agent '{name}' registered."
    except Exception as e:
        return str(e)

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
            "description": "Run a git command (e.g. 'git add . && git commit -m msg && git push').",
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
    print(f"Processing {task_id} ({agent_type})")
    system_prompt = AGENT_PROMPTS.get(agent_type, "You are a helpful assistant.")
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": input_text}
    ]
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

def task_poller():
    print("Poller started.")
    while True:
        try:
            res = supabase.table("agent_tasks").select("*").eq("status", "ai_processing").limit(1).execute()
            if res.data:
                task = res.data[0]
                process_task(task["id"], task["agent_type"], task["input_text"])
        except Exception as e:
            print(f"Poll error: {e}")
        time.sleep(5)

@app.on_event("startup")
def startup():
    threading.Thread(target=task_poller, daemon=True).start()

@app.get("/")
def root():
    return {"status": "AiM Worker running"}
PY_EOF

# Commit and push
echo "📦 Committing and pushing..."
git add .
git commit -m "Add Builder page and worker" || echo "Nothing to commit"
git push origin main

echo ""
echo "✅ Bootstrap complete!"
echo "Next: deploy worker to Render (manual step):"
echo "  1. Go to dashboard.render.com, sign in with GitHub."
echo "  2. New Web Service → Connect 'peerzadafahad/deep-agents'."
echo "  3. Set Build: pip install -r worker/requirements.txt"
echo "  4. Start: cd worker && uvicorn main:app --host 0.0.0.0 --port \$PORT"
echo "  5. Add environment variables: DEEPSEEK_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GITHUB_TOKEN, VERCEL_DEPLOY_HOOK (create a deploy hook in Vercel project settings first)."
echo "  6. Deploy. The worker will start polling for tasks."
echo "📱 Then open https://deep-agents-theta.vercel.app/builder"