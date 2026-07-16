'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  User, Code, Palette, Film, TrendingUp,
  MessageCircle, PenTool, Headphones, Bug, Wallet,
  ChevronRight, Wrench,
} from 'lucide-react';

interface Agent {
  id: number;
  name: string;
  role: string;
  permissions: string[];
  apps: string[];
  progress: number;
  status: string;
}

interface TechItem {
  id: number;
  tool: string;
  category: string;
  status: string;
  configuration: string;
  progress: number;
}

interface Phase {
  id: number;
  title: string;
  description: string;
  status: string;
  order_index: number;
  progress: number;
}

const agentIcons: Record<string, React.ReactNode> = {
  Manager: <User className="w-5 h-5" />,
  Developer: <Code className="w-5 h-5" />,
  Designer: <Palette className="w-5 h-5" />,
  Animator: <Film className="w-5 h-5" />,
  'Google Marketer': <TrendingUp className="w-5 h-5" />,
  'Social Marketer': <MessageCircle className="w-5 h-5" />,
  Writer: <PenTool className="w-5 h-5" />,
  Support: <Headphones className="w-5 h-5" />,
  Tester: <Bug className="w-5 h-5" />,
  Accountant: <Wallet className="w-5 h-5" />,
};

const statusColors: Record<string, string> = {
  'Not Started': 'bg-gray-200 text-gray-600',
  'In Progress': 'bg-blue-100 text-blue-800',
  'Connected': 'bg-green-100 text-green-800',
  'Done': 'bg-green-500 text-white',
};

export default function RoadmapPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [techStack, setTechStack] = useState<TechItem[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const [agentsRes, techRes, phasesRes] = await Promise.all([
        supabase.from('agents').select('*'),
        supabase.from('tech_stack').select('*'),
        supabase.from('phases').select('*').order('order_index'),
      ]);
      if (agentsRes.data) setAgents(agentsRes.data);
      if (techRes.data) setTechStack(techRes.data);
      if (phasesRes.data) setPhases(phasesRes.data);
      setLoading(false);
    };
    fetchData();
  }, []);

  const updateAgentProgress = async (id: number, progress: number) => {
    setAgents(prev => prev.map(a => (a.id === id ? { ...a, progress } : a)));
    await supabase.from('agents').update({ progress }).eq('id', id);
  };

  const updateTechProgress = async (id: number, progress: number) => {
    setTechStack(prev => prev.map(t => (t.id === id ? { ...t, progress } : t)));
    await supabase.from('tech_stack').update({ progress }).eq('id', id);
  };

  const updatePhaseProgress = async (id: number, progress: number) => {
    setPhases(prev => prev.map(p => (p.id === id ? { ...p, progress } : p)));
    await supabase.from('phases').update({ progress }).eq('id', id);
  };

  if (loading) return <div className="flex justify-center items-center min-h-screen">Loading roadmap...</div>;

  const overallProgress = Math.round(
    (agents.reduce((acc, a) => acc + a.progress, 0) / (agents.length * 100) +
      techStack.reduce((acc, t) => acc + t.progress, 0) / (techStack.length * 100) +
      phases.reduce((acc, p) => acc + p.progress, 0) / (phases.length * 100)) /
      3 *
      100
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 md:p-10">
      <header className="mb-10">
        <div className="flex items-center gap-3">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white">AiM • Agency AI Team</h1>
          <span className="px-3 py-1 text-sm rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-200">
            {overallProgress}% complete
          </span>
        </div>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Interactive roadmap — click progress bars to update.
        </p>
      </header>

      {/* Overall Progress Bar */}
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 mb-8">
        <div
          className="bg-indigo-600 h-4 rounded-full transition-all duration-500"
          style={{ width: `${overallProgress}%` }}
        />
      </div>

      {/* Agents Grid */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2 dark:text-white">
          <User className="w-6 h-6" /> AI Agents
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map(agent => (
            <div key={agent.id} className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 hover:shadow-md transition">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900 rounded-lg">
                  {agentIcons[agent.name] || <User />}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">{agent.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{agent.role}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mb-3">
                {agent.apps.map(app => (
                  <span key={app} className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-gray-600 dark:text-gray-300">{app}</span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 cursor-pointer"
                  onClick={() => {
                    const newProgress = (agent.progress + 10) % 110;
                    updateAgentProgress(agent.id, newProgress > 100 ? 100 : newProgress);
                  }}
                >
                  <div className="bg-indigo-600 h-2 rounded-full transition-all" style={{ width: `${agent.progress}%` }} />
                </div>
                <span className="text-xs font-mono text-gray-500 dark:text-gray-400 w-8">{agent.progress}%</span>
              </div>
              <p className="mt-2 text-xs text-gray-400">{agent.status}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tech Stack Table */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2 dark:text-white">
          <Wrench className="w-6 h-6" /> Tech Stack
        </h2>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tool</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progress</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {techStack.map(item => (
                <tr key={item.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{item.tool}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.category}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs rounded-full ${statusColors[item.status] || 'bg-gray-100'}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 cursor-pointer"
                        onClick={() => {
                          const newProgress = (item.progress + 10) % 110;
                          updateTechProgress(item.id, newProgress > 100 ? 100 : newProgress);
                        }}
                      >
                        <div className="bg-green-600 h-1.5 rounded-full" style={{ width: `${item.progress}%` }} />
                      </div>
                      <span className="text-xs font-mono">{item.progress}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Roadmap Phases */}
      <section>
        <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2 dark:text-white">
          <ChevronRight className="w-6 h-6" /> Development Phases
        </h2>
        <div className="space-y-4">
          {phases.map(phase => (
            <div key={phase.id} className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-semibold text-lg dark:text-white">{phase.title}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{phase.description}</p>
                </div>
                <span className={`px-2 py-1 text-xs rounded-full ${statusColors[phase.status] || 'bg-gray-100'}`}>
                  {phase.status}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 cursor-pointer"
                  onClick={() => {
                    const newProgress = (phase.progress + 10) % 110;
                    updatePhaseProgress(phase.id, newProgress > 100 ? 100 : newProgress);
                  }}
                >
                  <div className="bg-indigo-600 h-3 rounded-full transition-all" style={{ width: `${phase.progress}%` }} />
                </div>
                <span className="font-mono text-sm dark:text-white">{phase.progress}%</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}