import source from "../data/psgc-rancamaya-data.json" with { type: "json" };
import type { ScoringCourse } from "./course-catalog.ts";
import type { AwardCategory, Player } from "./scoring.ts";

export type PsgcFixtureParticipant = { id: number; name: string; handicap: number; awardCategory: AwardCategory; scores: number[] };
type PsgcPairingSource = { teeBox: number; flight: number; name: string };
type PsgcFixtureSource = { tournamentName: string; eventDate: string; participants: PsgcFixtureParticipant[]; pairings: PsgcPairingSource[] };
export type LoadedPsgcFixture = {
  name: string; eventDate: string; rounds: Array<{ id: number; courseId: number; players: number }>; scores: Record<number, Player[]>;
  pairingMatched: number; unmatchedPairingNames: string[]; dataNotice: string;
};

export const PSGC_FIXTURE_NAME = "Gobar PSGC — Rancamaya";
export const PSGC_SOURCE_NOTE = "Source note: PSGC Load Data uses the authoritative 60-player roster and explicit Flight categories.";

const normalize = (value: string) => value.toLocaleUpperCase().replace(/[^A-Z0-9]/g, "");
const pairingAliases: Record<string, string> = {
  PAKSUYITNO: "SUYITNOPATMOSUKISMO", SALISSA: "SALISSAPRILIAN", EDYFRIZT: "EDYFRITZ", GUNUNGS: "GUNUNGSARJONOH",
  SATOTOA: "SATOTOAGUSTONO", JHONYMS: "JHONNYMSARAGIH", AMRILA: "AMRILAMINULLAH", AKBARP: "AKBARPRADIMA",
  AZHARP: "AZHARPALIMO", SIGITSW: "SIGITSWASKITO", KHALIDB: "KHALIDBOSNIA", CHARLEST: "CHARLESHLTOBING",
  ELIZARH: "ELIZARHASIBUAN", MPRIADI: "MUHAMMADPRIADI", WAYANK: "IWAYANKARTAWIJAYA", SYAHABUDDIN: "SYAHABUDDINAR",
  JDFSARAGIH: "JOHANNESDFSARAGIH", BUDIPRA: "BUDIPRAHORO", NAZIRMAN: "NAZIRMANM", TEDDY: "TEDDYANUS",
  AZAIDY: "ACHMADZAIDY", KUKUHK: "KUNCOROKUKUH", HERRYDJAUHARI: "HERIDJAUHARI", TATOKS: "TATOKSUDARTO",
  RUSMANNAPIT: "MSRUSMANNAPIT", TRIYASNAWAN: "TRIYASMAWAN", WALUYOWD: "WALUYOWIROD", NANANGHW: "NANANGHUTAWARDANA",
  ERWINBUST: "ERWINBUSTAMI", RUBIADISURYA: "RUBIADISOERJA", ANIZAR: "ANIZARBURLIAN", GUNAWAN: "GUNAWANZAPRI",
  LUKITOS: "LUKITOSUWARNO", PANCA: "PANCAPRIANTARA", JOHNHS: "JOHNH SIMAMORA".replace(/[^A-Z0-9]/g, ""),
  EDDYSJAHBUDDIN: "EDDYSYAHBUDDIN", BUDISANTOSO: "BUDISANTOSA", SISWANTORO: "SISWANTOROM",
};

export function loadPsgcRancamayaFixture(courses: ScoringCourse[]): LoadedPsgcFixture | null {
  const fixture = source as PsgcFixtureSource;
  const course = courses.find((candidate) => normalize(candidate.name) === "RANCAMAYA");
  if (!course?.pars || fixture.participants.length !== 60 || fixture.participants.some((participant) => participant.scores.length !== 18 || participant.scores.some((score) => !Number.isInteger(score) || score <= 0))) return null;
  const byCanonicalName = new Map(fixture.participants.map((participant) => [normalize(participant.name), participant]));
  const pairingByParticipantId = new Map<number, string>();
  const unmatchedPairingNames: string[] = [];
  for (const pairing of fixture.pairings) {
    const sourceName = normalize(pairing.name);
    const canonicalName = pairingAliases[sourceName] ?? sourceName;
    const participant = byCanonicalName.get(canonicalName);
    if (!participant || pairingByParticipantId.has(participant.id)) { unmatchedPairingNames.push(pairing.name); continue; }
    pairingByParticipantId.set(participant.id, `${pairing.teeBox}${pairing.flight === 1 ? "A" : "B"}`);
  }
  const scores: Record<number, Player[]> = {
    1: fixture.participants.map((participant) => ({
      id: `psgc:${participant.id}`,
      name: participant.name,
      handicap: participant.handicap,
      awardCategory: participant.awardCategory,
      pairing: pairingByParticipantId.get(participant.id) ?? "",
      scores: [...participant.scores],
    })),
  };
  return {
    name: PSGC_FIXTURE_NAME, eventDate: fixture.eventDate,
    rounds: [{ id: 1, courseId: course.id, players: fixture.participants.length }], scores,
    pairingMatched: pairingByParticipantId.size, unmatchedPairingNames,
    dataNotice: PSGC_SOURCE_NOTE,
  };
}