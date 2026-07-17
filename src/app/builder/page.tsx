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

    // Show "thinking" indicator
    setResponses(prev => [...prev, {role:'builder', text:'⏳ Processing...'}]);

    const { data, error } = await supabase
      .from('agent_tasks')
      .insert({ agent_type: 'Builder', input_text: command, status: 'ai_processing' })
      .select('id')
      .single();

    if (error) {
      setResponses(prev => prev.filter(r => r.text !== '⏳ Processing...').concat({role:'builder', text:`❌ ${error.message}`}));
      return;
    }

    const taskId = data.id;
    let attempts = 0;
    const maxAttempts = 60; // 2 minutes total

    const check = setInterval(async () => {
      attempts++;
      const { data: task } = await supabase
        .from('agent_tasks')
        .select('status, output_text')
        .eq('id', taskId)
        .single();

      if (task?.status === 'in_review') {
        clearInterval(check);
        setResponses(prev => prev.filter(r => r.text !== '⏳ Processing...').concat({role:'builder', text: task.output_text || '(done)'}));
      } else if (task?.status === 'failed') {
        clearInterval(check);
        setResponses(prev => prev.filter(r => r.text !== '⏳ Processing...').concat({role:'builder', text: `❌ Failed: ${task.output_text}`}));
      } else if (attempts > maxAttempts) {
        clearInterval(check);
        setResponses(prev => prev.filter(r => r.text !== '⏳ Processing...').concat({role:'builder', text:'⏰ Still working... check Render logs for progress.'}));
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
