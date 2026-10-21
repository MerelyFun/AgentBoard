import { Code2, Cpu, ShieldCheck, UserRound } from 'lucide-react';
import type { AgentRole } from '../domain/board';

const ROLE_ICONS = {
  'game-producer': UserRound,
  'game-tech-lead': Cpu,
  'game-developer': Code2,
  'game-verifier': ShieldCheck,
};

export function RoleAvatar({ role, className = '' }: { role: AgentRole; className?: string }) {
  const Icon = ROLE_ICONS[role];
  return <span className={`role-avatar ${role} ${className}`} aria-hidden="true"><Icon size={17} strokeWidth={1.8} /></span>;
}
