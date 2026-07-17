'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { X, MessageCircle, Mic, MicOff, Clock } from 'lucide-react';
const [chatOpen, setChatOpen] = useState(false);

interface TaskItem {
  id: number;
  status: string;
  input_text: string;
  output_text: string;
}

export default function BuilderSidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [input, setInput] = useState('');
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [listening, setListening] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Elapsed timer
  useEffect(() => {
    if (currentTaskId) {
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsedSeconds(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentTaskId]);

  // Real-time task updates
  useEffect(() => {
    if (!currentTaskId) return;

    const channel = supabase
      .channel(`sidebar-task-${currentTaskId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'agent_tasks',
          filter: `id=eq.${currentTaskId}`
        },
        (payload) => {
          const updated = payload.new as TaskItem;
          setTasks(prev => {
            const filtered = prev.filter(t => t.id !== updated.id);
            return [...filtered, updated];
          });
          if (updated.status === 'in_review' || updated.status === 'failed') {
            setCurrentTaskId(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentTaskId]);

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
        input_text: command
      }]);
      return;
    }

    setTasks(prev => [...prev, {
      id: data.id,
      status: 'ai_processing',
      input_text: command,
      output_text: ''
    }]);
    setCurrentTaskId(data.id);
  };

  const toggleVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return alert('Speech not supported');

    if (listening) {
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript.trim();
      if (transcript) {
        setInput(transcript);
        setTimeout(() => sendCommand(transcript), 300);
      }
    };
    recognition.onerror = () => setListening(false);
    recognition.start();
    setListening(true);
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const quickActions = [
    { emoji: '📧', label: 'Email Agent', command: 'Create a new agent called Email Marketer that writes newsletters and campaigns' },
    { emoji: '🎨', label: 'Design Agent', command: 'Create a design agent that generates UI mockups and style guides' },
    { emoji: '📊', label: 'SEO Agent', command: 'Create an SEO agent that does keyword research and site audits' },
    { emoji: '📱', label: 'Social Agent', command: 'Create a social media agent that writes Instagram and LinkedIn posts' },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      
      {/* Sidebar */}
      <div className="relative w-full max-w-md bg-gray-900 border-l border-gray-700 flex flex-col h-full shadow-2xl animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white">AiM Team</h1>
            {/* <span className="px-3 py-1 text-sm rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200">
              {overallProgress}% complete
            </span> */}
          </div>
          <button
            onClick={() => setChatOpen(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-full text-sm font-medium transition shadow-lg"
          >
            <MessageCircle className="w-4 h-4" />
            AiM Chat
          </button>
        </div>

        {/* Active timer */}
        {currentTaskId && (
          <div className="mx-4 mt-3 p-3 bg-indigo-900/40 border border-indigo-500/40 rounded-lg flex items-center gap-3">
            <div className="animate-spin text-indigo-400">⚙️</div>
            <div className="text-sm text-indigo-300 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Working... {formatTime(elapsedSeconds)}
            </div>
          </div>
        )}

        {/* Task list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {tasks.length === 0 && !currentTaskId && (
            <div className="text-center text-gray-500 mt-20">
              <div className="text-4xl mb-3">🚀</div>
              <div className="text-sm">Ask me to build or improve agents</div>
            </div>
          )}
          {tasks.map(task => (
            <div key={task.id} className={`p-3 rounded-xl ${
              task.status === 'ai_processing' ? 'bg-indigo-900/20 border border-indigo-500/20' :
              task.status === 'in_review' ? 'bg-green-900/20 border border-green-500/20' :
              'bg-red-900/20 border border-red-500/20'
            }`}>
              <div className="text-xs font-medium mb-1 text-gray-300">
                {task.status === 'ai_processing' ? '⚙️ Processing' :
                 task.status === 'in_review' ? '✅ Complete' :
                 '❌ Failed'}
              </div>
              <div className="text-xs text-gray-500 mb-2">{task.input_text?.substring(0, 80)}</div>
              {task.output_text && (
                <div className="text-sm text-gray-200 whitespace-pre-wrap max-h-24 overflow-y-auto">
                  {task.output_text.substring(0, 250)}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div className="px-4 pb-2 flex gap-2 flex-wrap">
          {quickActions.map((action, i) => (
            <button
              key={i}
              onClick={() => sendCommand(action.command)}
              className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded-full border border-gray-600 transition"
            >
              {action.emoji} {action.label}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-gray-700">
          <div className="flex gap-2 items-center">
            <button
              onClick={toggleVoice}
              className={`p-2 rounded-full transition ${
                listening ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendCommand(input)}
              placeholder="Type or speak..."
              className="flex-1 bg-gray-800 border border-gray-600 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-400"
            />
            <button
              onClick={() => sendCommand(input)}
              className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-full text-sm font-medium transition"
            >
              Send
            </button>
          </div>
        </div>
      </div>
      <BuilderSidebar isOpen={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}