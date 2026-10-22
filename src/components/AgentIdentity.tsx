import { Brush, Code2, Cpu, Palette, PanelsTopLeft, ShieldCheck, Sparkles, UserRound, type LucideIcon } from 'lucide-react';
import type { AgentRole } from '../domain/board';

const ROLE_ICONS: Record<AgentRole, LucideIcon> = {
  'game-producer': UserRound,
  'game-tech-lead': Cpu,
  'game-developer': Code2,
  'game-verifier': ShieldCheck,
  'game-art-lead': Palette,
  'game-asset-artist': Brush,
  'game-ui-artist': PanelsTopLeft,
  'game-vfx-artist': Sparkles,
};

export function RoleAvatar({ role, className = '' }: { role: AgentRole; className?: string }) {
  const Icon = ROLE_ICONS[role];
  return <span className={`role-avatar ${role} ${className}`} aria-hidden="true"><Icon size={17} strokeWidth={1.8} /></span>;
}
