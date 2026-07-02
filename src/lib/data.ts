import debriefsRaw from '../data/debriefs.json';
import demoCommandsRaw from '../data/demoCommands.json';
import instructorsRaw from '../data/instructors.json';
import manifestRaw from '../data/manifest.json';
import permissionsRaw from '../data/permissions.json';
import studentsRaw from '../data/students.json';
import vocabularyRaw from '../data/vocabulary.json';
import type { Debrief, Instructor, ManifestDestination, Role, Student } from '../types';

export const students = studentsRaw as Student[];
export const instructors = instructorsRaw as Instructor[];
export const debriefs = debriefsRaw as Debrief[];
export const manifest = manifestRaw as ManifestDestination[];
export const permissions = permissionsRaw as Record<Role, Record<string, boolean | string>>;
export const vocabulary = vocabularyRaw as {
  maneuvers: string[];
  statuses: string[];
  dateRanges: string[];
  synonyms: Record<string, string>;
  riskFamilies: Record<string, string[]>;
};
export const demoCommands = demoCommandsRaw as unknown as Array<{
  id: string;
  label: string;
  command: string;
  expected: Record<string, string>;
}>;

export const organization = {
  product: 'Flight School Local iBar',
  subtitle: 'Client-side microLM intent routing demo',
  school: 'Pacific Horizon Flight Academy',
  location: 'Phoenix, Arizona',
  airport: 'KDVT - Phoenix Deer Valley Airport'
};

export const findDebriefByStudentId = (studentId: string) => debriefs.find((debrief) => debrief.studentId === studentId);
export const findStudentById = (studentId: string) => students.find((student) => student.id === studentId);
