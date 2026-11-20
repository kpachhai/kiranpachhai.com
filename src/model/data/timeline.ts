import type { TimelineEntry } from '../schema'
import { LINKEDIN, OWNER } from './sources'

// Titles and years only; no employer names.
export const timeline: TimelineEntry[] = [
  { kind: 'role', title: 'Developer Advocate', years: '2025 to now', source: LINKEDIN },
  { kind: 'role', title: 'Lead Blockchain Architect', years: '2023-2025', source: LINKEDIN },
  { kind: 'role', title: 'Technical Lead', years: '2020-2023', source: LINKEDIN },
  { kind: 'role', title: 'Course Instructor', years: '2022-2023', source: LINKEDIN },
  {
    kind: 'role',
    title: 'Blockchain Developer Relations Engineer, then Technical Lead and Blockchain Lead',
    years: '2018-2020',
    source: OWNER,
  },
  { kind: 'role', title: 'DevOps Engineer / Site Reliability Engineer', years: '2016-2018', source: LINKEDIN },
  { kind: 'role', title: 'Software Engineer / Rotation Associate', years: '2014-2016', source: LINKEDIN },
  { kind: 'role', title: 'Student software and IT roles', years: '2010-2014', source: LINKEDIN },
  { kind: 'education', title: 'B.S. Computer Science and Math, University of Colorado Boulder', years: '2010-2014', source: LINKEDIN },
  {
    kind: 'education',
    title: 'Master of Business and Technology, University of Georgia Terry College of Business',
    years: '2019-2021',
    source: LINKEDIN,
  },
]
