import type { Traits } from '../core/compatibility';
import type { IdealType, LearnedRow, Look } from '../core/looks';
export type { IdealType, LearnedRow, Look };

export type Media = {
  id: string;
  kind: 'photo' | 'video';
  videoRole?: 'intro' | 'personality' | 'lifestyle' | null;
  caption?: string | null;
  url?: string | null;          // signed URL in production; a local file in the demo
  palette?: [string, string];   // demo placeholder colours
  myScore?: number | null;      // the rating I gave with the gauge, if any
  moderation?: 'pending' | 'approved' | 'rejected';
};

export type Person = {
  id: string;
  firstName: string;
  age: number;
  city?: string | null;
  occupation?: string | null;
  bio?: string | null;
  intentions?: string | null;
  interests: string[];
  traits: Traits;
  distanceBand?: string | null;
  chapter?: number;
  media: Media[];
  look?: Look;
  fitsTheirIdeal?: number | null;   // how well I fit their ideal partner, 0..1; their answers stay private
};

export type Me = Person & { ink: number; inkThisWeek: number; assessmentsDone: string[]; idealTraits: Traits; idealTypes: IdealType[] };

export const MATCH_THRESHOLD = 70;

export type Tone = 'playful' | 'curious' | 'deeper' | 'ask_out';
export type Game = {
  id: string; kind: 'build_a_date' | 'this_or_that'; rounds: { prompt: string; options: string[] }[];
  status: 'active' | 'complete'; startedByMe: boolean;
  myPicks: Record<number, number>; theirPicks: Record<number, number>;   // theirs only for rounds I have picked
};

export type ReportReason = 'fake_profile' | 'inappropriate_photos' | 'harassment' | 'spam_or_scam' | 'underage' | 'felt_unsafe' | 'other';
export type About = { bio: string; occupation: string; city: string; intentions: string; interests: string[] };
export type BlockedRow = { personId: string; firstName: string; at: string };
export type ModReport = {
  id: string; personId: string; firstName: string; reason: ReportReason | 'felt_unsafe_on_date'; detail: string | null;
  status: 'open' | 'reviewing'; reportsAgainst: number; reporters: number; suspended: boolean; at: string;
};
export type ModMedia = { id: string; ownerId: string; ownerName: string; media: Media; at: string };

export type Message = { id: string; mine: boolean; kind: 'text' | 'voice'; body: string | null; at: string };

export type Match = {
  id: string;
  person: Pick<Person, 'id' | 'firstName' | 'media'>;
  status: 'queued' | 'open' | 'closed' | 'archived';
  level: number;
  lastMessage?: string | null;
  iWantToMeet: boolean;
};

export type IncomingLike = {
  likeId: string;
  person: Pick<Person, 'id' | 'firstName' | 'age'>;
  likedMedia: Media | null;      // which of my photos or videos they dialled, if any
  comment: string | null;        // their note
  photo: Media | null;           // their first photo
};

export type DatePlan = {
  id: string;
  venue: string;
  startsAt: string;
  status: 'proposed' | 'accepted' | 'declined' | 'cancelled' | 'confirmed' | 'held_for_review';
  proposedByMe: boolean;
  myConfirmation: boolean | null;  // what I said about whether it happened; the other answer is never shown
  myFeedbackGiven: boolean;
};

export type DateFeedback = {
  enjoyed: number; conversation: number; comfortable: number; matchedProfile: number; seeAgain: number; feltUnsafe: boolean;
};

export type Challenge = { code: string; period: 'day' | 'week'; done: boolean; claimed: boolean; ink: number };
export type BoardRow = { rank: number; firstName: string; chapter: number; ink: number; isMe: boolean };
export type LedgerEntry = { id: string; amount: number; reason: string; at: string };
export type MediaStat = { mediaId: string; raters: number; average: number | null };
export type PickedFile = { uri: string; mimeType?: string | null; kind: 'photo' | 'video' };

/** Everything the screens need. Two implementations: Supabase (real) and demo (in memory). */
export interface Api {
  readonly mode: 'supabase' | 'demo';
  getMe(): Promise<Me | null>;
  getIntroductions(): Promise<Person[]>;
  rateMedia(mediaId: string, score: number): Promise<void>;
  /** Dial a whole person 1 to 100. At or above MATCH_THRESHOLD both ways, it's a match. An optional note opens the chat. */
  dialProfile(personId: string, score: number, note?: string): Promise<{ matchId: string | null }>;
  getIncomingLikes(): Promise<IncomingLike[]>;
  getMatches(): Promise<Match[]>;
  getMessages(matchId: string): Promise<Message[]>;
  sendMessage(matchId: string, body: string | null, kind?: 'text' | 'voice'): Promise<void>;
  readyToMeet(matchId: string): Promise<boolean>;
  closeMatch(matchId: string, note: string): Promise<void>;
  /** Three AI reply ideas to move the conversation on. Nothing is sent: the app puts the idea in the composer. */
  getSuggestions(matchId: string, tone: Tone): Promise<{ suggestions: string[]; usedTheirMessages: boolean }>;
  getGames(matchId: string): Promise<Game[]>;
  startGame(matchId: string, kind: Game['kind']): Promise<void>;
  playGame(gameId: string, round: number, option: number): Promise<void>;
  getDatePlans(matchId: string): Promise<DatePlan[]>;
  proposeDate(matchId: string, venue: string, startsAt: Date): Promise<void>;
  respondToDate(planId: string, accept: boolean): Promise<void>;
  confirmDate(planId: string, happened: boolean): Promise<void>;
  submitDateFeedback(planId: string, f: DateFeedback): Promise<void>;
  submitAssessment(kind: string, traits: Record<string, number>): Promise<number>;
  getChallenges(): Promise<Challenge[]>;
  claimChallenge(code: string): Promise<number>;
  getBoard(local: boolean): Promise<BoardRow[]>;
  getConsent(kind: string): Promise<boolean>;
  setConsent(kind: string, granted: boolean): Promise<void>;
  uploadMedia(file: PickedFile, videoRole?: 'intro' | 'personality' | 'lifestyle'): Promise<void>;
  deleteMedia(mediaId: string): Promise<void>;
  saveMyLook(look: Look): Promise<void>;
  submitIdealPartner(traits: Record<string, number>): Promise<number>;
  saveIdealType(t: IdealType): Promise<void>;
  deleteIdealType(rank: number): Promise<void>;
  getLearnedType(): Promise<LearnedRow[]>;
  getLedger(): Promise<LedgerEntry[]>;
  getMyMediaStats(): Promise<MediaStat[]>;
  /** Report someone. Blocks them too unless block is false. They are never told who reported them. */
  reportMember(personId: string, reason: ReportReason, detail?: string, block?: boolean): Promise<void>;
  blockMember(personId: string): Promise<void>;
  unblockMember(personId: string): Promise<void>;
  getBlocked(): Promise<BlockedRow[]>;
  saveAbout(a: About): Promise<void>;
  /** Moderation console, staff only. */
  isStaff(): Promise<boolean>;
  getModReports(): Promise<ModReport[]>;
  getModMedia(): Promise<ModMedia[]>;
  resolveReport(reportId: string, outcome: 'dismissed' | 'upheld' | 'reviewing', suspendDays?: number): Promise<void>;
  reviewMedia(mediaId: string, approve: boolean): Promise<void>;
  /** Demo only: move a planned date into the past so the after-date steps can be tried. */
  demoSkipToAfter?(planId: string): Promise<void>;
  /** Calls back whenever data behind the screens may have changed. Returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
}
