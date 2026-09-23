import { Repository, type RepoContext } from "./repository";
import * as D from "./entities";

export function createRepos(ctx: RepoContext) {
  return {
    semesters: new Repository(D.semesterDef, ctx),
    gradingScales: new Repository(D.gradingScaleDef, ctx),
    subjects: new Repository(D.subjectDef, ctx),
    timetable: new Repository(D.timetableDef, ctx),
    lectures: new Repository(D.lectureDef, ctx),
    attendance: new Repository(D.attendanceDef, ctx),
    notes: new Repository(D.noteDef, ctx),
    files: new Repository(D.fileDef, ctx),
    deadlines: new Repository(D.deadlineDef, ctx),
    tasks: new Repository(D.taskDef, ctx),
    subtasks: new Repository(D.subtaskDef, ctx),
    projects: new Repository(D.projectDef, ctx),
    milestones: new Repository(D.milestoneDef, ctx),
    members: new Repository(D.memberDef, ctx),
    meetings: new Repository(D.meetingDef, ctx),
    grades: new Repository(D.gradeDef, ctx),
    questions: new Repository(D.questionDef, ctx),
    journal: new Repository(D.journalDef, ctx),
    resources: new Repository(D.resourceDef, ctx),
    goals: new Repository(D.goalDef, ctx),
    goalMilestones: new Repository(D.goalMilestoneDef, ctx),
    expenses: new Repository(D.expenseDef, ctx),
    whiteboards: new Repository(D.whiteboardDef, ctx),
    commands: new Repository(D.commandDef, ctx),
    ctf: new Repository(D.ctfDef, ctx),
    labs: new Repository(D.labDef, ctx),
    roadmaps: new Repository(D.roadmapDef, ctx),
    roadmapItems: new Repository(D.roadmapItemDef, ctx),
    studySessions: new Repository(D.studySessionDef, ctx),
  };
}

export type Repos = ReturnType<typeof createRepos>;
export { Repository, NotFoundError } from "./repository";
export type { ListQuery, EntityDef, RepoContext } from "./repository";
