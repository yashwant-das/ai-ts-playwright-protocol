export type BlockReason = 'dependency' | 'requirement' | 'selector' | 'verification' | 'environment' | 'regression';

export interface Task {
  id: string;                    // e.g. "T-003"
  title: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
  dependsOn?: string[];          // e.g. ["T-001", "T-002"]
  blockReason?: BlockReason;
}
