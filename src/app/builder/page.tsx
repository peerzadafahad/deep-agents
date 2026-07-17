'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export default function BuilderPage() {
  const [input, setInput] = useState('');
  const [tasks, setTasks] = useState<any[]>([]);
  const [listening, setListening] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<number | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Subscribe to real-time updates for the current task
  useEffect(() => {
    if (!currentTaskId) return;
    
    const channel = supabase
      .channel(`task-${currentTaskId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'agent_tasks',
          filter: `id=eq.${currentTaskId}`
        },
        (payload) => {
          const updated = payload.new;
          // Add to task list
          setTasks(prev => {
            const filtered = prev.filter(t => t.id !== updated.id);
            return [...filtered, updated];
          });
          // If done, clear current task
          if (updated.status === 'in_review' || updated.status === 'failed') {
            setCurrentTaskId(null);
            // Speak the result if in voice mode
            if (voiceMode && updated.output_text) {
              const utterance = new SpeechSynthesisUtterance(
                updated.status === 'in_review' 
                  ? 'Done. ' + updated.output_text.substring(0, 200)
                  : 'Failed. ' + updated.output_text.substring(0, 200)
              );
              window.speechSynthesis.speak(utterance);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentTaskId, voiceMode]);

  // Voice recognition setup
  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return alert('Speech not supported');
    
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    
    recognition.onresult = (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      if (transcript) {
        setInput(transcript);
        // Auto-send after a short delay
        setTimeout(() => sendCommand(transcript), 500);
      }
    };
    
    recognition.onerror = () => {
      setListening(false);
      setVoiceMode(false);
    };
    
    recognition.start();
    setListening(true);
    setVoiceMode(true);
    recognitionRef.current = recognition;
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setListening(false);
    setVoiceMode(false);
  };

  const sendCommand = async (command: string) => {
    if (!command.trim()) return;
    setInput('');

    const { data, error } = await supabase
      .from('agent_tasks')
      .insert({ 
        agent_type: 'Builder', 
        input_text: command, 
        status: 'ai_processing' 
      })
      .select('id')
      .single();

    if (error) {
      setTasks(prev => [...prev, { 
        id: Date.now(), 
        status: 'failed', 
        output_text: error.message,
        input_text: command,
        agent_type: 'Builder'
      }]);
      return;
    }

    // Add pending task
    setTasks(prev => [...prev, { 
      id: data.id, 
      status: 'ai_processing',
      input_text: command,
      agent_type: 'Builder'
    }]);
    
    setCurrentTaskId(data.id);
    
    // Speak confirmation in voice mode
    if (voiceMode) {
      const utterance = new SpeechSynthesisUtterance('Working on it');
      window.speechSynthesis.speak(utterance);
    }
  };

  // Quick action buttons
  const quickActions = [
    { label: '📧 Create Email Agent', command: 'Create a new agent called Email Marketer that writes newsletters and campaigns' },
    { label: '🎨 Create Design Agent', command: 'Create a design agent that generates UI mockups and style guides' },
    { label: '📊 Create SEO Agent', command: 'Create an SEO agent that does keyword research and site audits' },
    { label: '📱 Create Social Agent', command: 'Create a social media agent that writes Instagram and LinkedIn posts' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8">
      <div className="max-w-2xl mx-auto flex flex-col h-[90vh]">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent">
            🤖 AiM Builder
          </h1>
          <button
            onClick={voiceMode ? stopListening : startListening}
            className={`p-3 rounded-full text-lg transition-all ${
              listening 
                ? 'bg-red-600 animate-pulse ring-4 ring-red-400' 
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            {listening ? '🎤 Stop' : '🎤 Voice'}
          </button>
        </div>

        {/* Active task indicator */}
        {currentTaskId && (
          <div className="mb-4 p-3 bg-indigo-900/50 border border-indigo-500/50 rounded-lg flex items-center gap-3">
            <div className="animate-spin text-lg">⚙️</div>
            <div className="text-sm text-indigo-300">Working on your request...</div>
          </div>
        )}

        {/* Task list */}
        <div className="flex-1 overflow-y-auto border border-gray-700 rounded-xl p-4 mb-4 space-y-3 bg-gray-900/50">
          {tasks.length === 0 && !currentTaskId && (
            <div className="text-center text-gray-500 mt-10">
              <div className="text-4xl mb-3">🚀</div>
              <div className="font-medium mb-1">Ready to build</div>
              <div className="text-sm">Tap a quick action or speak a command</div>
            </div>
          )}
          {tasks.map((task) => (
            <div key={task.id} className={`p-4 rounded-xl ${
              task.status === 'ai_processing' ? 'bg-indigo-900/30 border border-indigo-500/30' :
              task.status === 'in_review' ? 'bg-green-900/30 border border-green-500/30' :
              'bg-red-900/30 border border-red-500/30'
            }`}>
              <div className="flex items-start justify-between mb-2">
                <div className="text-sm font-medium text-gray-300">
                  {task.status === 'ai_processing' ? '⚙️ Processing...' :
                   task.status === 'in_review' ? '✅ Done' :
                   '❌ Failed'}
                </div>
                <button 
                  onClick={() => setTasks(prev => prev.filter(t => t.id !== task.id))}
                  className="text-gray-500 hover:text-gray-300 text-xs"
                >
                  ✕
                </button>
              </div>
              <div className="text-xs text-gray-400 mb-2">{task.input_text?.substring(0, 100)}</div>
              {task.output_text && (
                <div className="text-sm text-gray-200 whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {task.output_text.substring(0, 300)}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div className="mb-3 flex gap-2 flex-wrap">
          {quickActions.map((action, i) => (
            <button
              key={i}
              onClick={() => sendCommand(action.command)}
              className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-full border border-gray-600 transition-colors"
            >
              {action.label}
            </button>
          ))}
        </div>

        {/* Text input */}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendCommand(input)}
            placeholder="Type a command or use voice..."
            className="flex-1 bg-gray-800 border border-gray-600 rounded-full px-5 py-3 focus:outline-none focus:border-indigo-400 text-white text-sm"
          />
          <button
            onClick={() => sendCommand(input)}
            className="bg-indigo-600 hover:bg-indigo-500 px-6 py-3 rounded-full font-medium text-sm transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}