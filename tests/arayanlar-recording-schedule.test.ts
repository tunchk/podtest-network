import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { grantHostAuthorization } from "@/lib/arayanlar/host-auth";
import { assignHost } from "@/lib/arayanlar/service";
import {
  cancelRecordingSchedule,
  scheduleRecording,
  toRecordingScheduleView,
} from "@/lib/arayanlar/recording-schedule";
import {
  formatRecordingSchedule,
  wallTimeToUtc,
  wallPartsFromUtc,
} from "@/lib/arayanlar/recording-time";
import { ARAYANLAR_NOTIF } from "@/lib/arayanlar/notifications";
import { FIXED_CLOSING_QUESTION, PREPARATION_SCHEMA_VERSION } from "@/lib/arayanlar/artifact-schema";

const root = path.resolve(__dirname, "..");
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL!,
});
const db = new PrismaClient({ adapter });
const suffix = `sched-${Date.now().toString(36)}`;

describe("recording schedule timezone helpers", () => {
  it("stores explicit timezone and formats TR display without throwing around DST", () => {
    // Europe/Berlin spring-forward 2026-03-29: 02:00 does not exist — reject.
    expect(() =>
      wallTimeToUtc({ date: "2026-03-29", time: "02:30", timeZone: "Europe/Berlin" }),
    ).toThrow();

    // Valid time after spring forward.
    const after = wallTimeToUtc({
      date: "2026-03-29",
      time: "03:30",
      timeZone: "Europe/Berlin",
    });
    const parts = wallPartsFromUtc(after, "Europe/Berlin");
    expect(parts).toEqual({ date: "2026-03-29", time: "03:30" });

    // Autumn fallback 2026-10-25 02:30 is ambiguous but maps to a valid instant.
    const autumn = wallTimeToUtc({
      date: "2026-10-25",
      time: "02:30",
      timeZone: "Europe/Berlin",
    });
    expect(formatRecordingSchedule({ scheduledAt: autumn, timeZone: "Europe/Berlin" })).toMatch(
      /25 Ekim 2026/,
    );
    expect(formatRecordingSchedule({ scheduledAt: autumn, timeZone: "Europe/Berlin" })).toMatch(
      /02:30/,
    );
  });
});

describe("Kariyer Portresi recording schedule", () => {
  let guestId = "";
  let hostId = "";
  let otherId = "";
  let adminId = "";
  let applicationId = "";

  beforeAll(async () => {
    const guest = await db.user.create({
      data: {
        name: "Sched Guest",
        email: `sched-guest-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "MEMBER",
      },
    });
    const host = await db.user.create({
      data: {
        name: "Sched Host",
        email: `sched-host-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "MEMBER",
      },
    });
    const other = await db.user.create({
      data: {
        name: "Sched Other",
        email: `sched-other-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "MEMBER",
      },
    });
    const admin = await db.user.create({
      data: {
        name: "Sched Admin",
        email: `sched-admin-${suffix}@example.com`,
        emailVerified: true,
        staffRole: "ADMIN",
      },
    });
    guestId = guest.id;
    hostId = host.id;
    otherId = other.id;
    adminId = admin.id;

    await grantHostAuthorization({
      userId: hostId,
      grantedByUserId: adminId,
      provenance: "test-schedule",
    });

    const app = await db.arayanlarApplication.create({
      data: {
        userId: guestId,
        status: "SUBMITTED",
        prepStatus: "READY",
        submittedRevision: 1,
        editorialTemplateVersion: "kariyer-portresi-producer-v1",
        submittedFacts: {
          displayName: "Sched Guest",
          targetRole: "QA",
          storyTopic: "x",
          contribution: "y",
          workPreferences: "",
          excludedTopics: "",
          contactChannel: "platform",
          profileHintsUsed: [],
        },
        draftAnswers: {},
        conversationTurns: [],
        questionsAsked: 0,
        confirmedCostAt: new Date(),
        submittedAt: new Date(),
      },
    });
    applicationId = app.id;

    await db.arayanlarArtifact.create({
      data: {
        applicationId,
        kind: "HOST_PACK",
        submittedRevision: 1,
        editorialTemplateVersion: "kariyer-portresi-producer-v1",
        generatedJson: {
          schemaVersion: PREPARATION_SCHEMA_VERSION,
          preparation: {
            identityPrep: {
              profileSignals: ["a", "b", "c"],
              careerThemes: [],
              careerTransitions: [],
              confirmedFacts: ["f"],
              missingInformation: [],
              guestPrepQuestions: ["g"],
              hostQuestions: ["h"],
            },
            storyCandidates: [
              {
                title: "t",
                sourceExperience: "s",
                whyThisCouldBeAStory: "w",
                knownFacts: ["k"],
                missingDetails: [],
                guestPrepQuestions: ["gq"],
                hostQuestions: ["hq"],
                followUpQuestions: [],
                sourceReferences: ["r"],
              },
            ],
            thinkingScenario: {
              scenario: "sc",
              whyItFitsThisCandidate: "why",
              whatTheHostShouldListenFor: ["l"],
              constraints: [],
            },
            jobSearchPrep: {
              knownPreferences: [],
              inferredButUnconfirmed: [],
              missingInformation: [],
              guestPrepQuestions: [],
              hostQuestions: [],
            },
            rapidFire: [
              { question: "q1", whyThisQuestionFits: "w1" },
              { question: "q2", whyThisQuestionFits: "w2" },
              { question: "q3", whyThisQuestionFits: "w3" },
              { question: "q4", whyThisQuestionFits: "w4" },
              { question: "q5", whyThisQuestionFits: "w5" },
            ],
            closingPrep: {
              fixedQuestion: FIXED_CLOSING_QUESTION,
              guestReflectionPrompts: ["p1", "p2"],
            },
            overallMissingInformation: [],
          },
        },
      },
    });

    await assignHost({
      applicationId,
      hostUserId: hostId,
      assignedByUserId: adminId,
    });
  });

  afterAll(async () => {
    const ids = [guestId, hostId, otherId, adminId].filter(Boolean);
    await db.inAppNotification.deleteMany({ where: { userId: { in: ids } } });
    await db.arayanlarArtifact.deleteMany({ where: { applicationId } });
    await db.arayanlarApplication.deleteMany({ where: { id: applicationId } });
    await db.hostAuthorization.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it("READY with no schedule renders unscheduled candidate copy in sources", () => {
    const view = toRecordingScheduleView({
      recordingScheduledAt: null,
      recordingTimezone: null,
      recordingMeetingUrl: null,
      recordingSchedulingNote: null,
      recordingScheduleVersion: 0,
      recordingCompletedAt: null,
    });
    expect(view.scheduled).toBe(false);

    const basvurum = readFileSync(path.join(root, "src/app/arayanlar/basvurum/page.tsx"), "utf8");
    expect(basvurum).toMatch(/CandidateRecordingSchedule/);
    const candidate = readFileSync(
      path.join(root, "src/components/arayanlar/candidate-recording-schedule.tsx"),
      "utf8",
    );
    expect(candidate).toMatch(/Kayıt zamanı henüz belirlenmedi/);
    expect(candidate).toMatch(/Kayıt zamanı/);
    expect(candidate).toMatch(/Kayıt bağlantısını aç/);
    expect(candidate).toMatch(/noopener noreferrer/);
  });

  it("authorized host can schedule; candidate sees timezone; unauthorized cannot", async () => {
    const jobsBefore = await db.aiJob.count({ where: { arayanlarApplicationId: applicationId } });
    const creditsBefore = await db.creditLedgerEntry.count({ where: { userId: guestId } });

    await expect(
      scheduleRecording({
        actorUserId: guestId,
        applicationId,
        date: "2026-09-24",
        time: "19:00",
        timeZone: "Europe/Berlin",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      scheduleRecording({
        actorUserId: otherId,
        applicationId,
        date: "2026-09-24",
        time: "19:00",
        timeZone: "Europe/Berlin",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const first = await scheduleRecording({
      actorUserId: hostId,
      applicationId,
      date: "2026-09-24",
      time: "19:00",
      timeZone: "Europe/Berlin",
      meetingUrl: "https://meet.example.com/room",
      note: "Bağlantı kayıt saatinden kısa süre önce aktif olabilir.",
    });
    expect(first.ok).toBe(true);
    expect(first.changed).toBe(true);
    expect(first.schedule.scheduled).toBe(true);
    expect(first.schedule.timeZone).toBe("Europe/Berlin");
    expect(first.schedule.displayWhen).toMatch(/24 Eylül 2026/);
    expect(first.schedule.displayWhen).toMatch(/19:00/);
    expect(first.schedule.meetingUrl).toBe("https://meet.example.com/room");

    const row = await db.arayanlarApplication.findUniqueOrThrow({ where: { id: applicationId } });
    expect(row.recordingTimezone).toBe("Europe/Berlin");
    expect(row.recordingScheduledAt).toBeTruthy();
    expect(row.recordingScheduleVersion).toBe(1);
    expect(row.status).toBe("SUBMITTED");
    expect(row.prepStatus).toBe("READY");

    const scheduledNotifs = await db.inAppNotification.findMany({
      where: { userId: guestId, kind: ARAYANLAR_NOTIF.recordingScheduled },
    });
    expect(scheduledNotifs).toHaveLength(1);
    expect(scheduledNotifs[0]?.href).toBe("/arayanlar/basvurum");
    expect(scheduledNotifs[0]?.title).toMatch(/kayıt zamanı belirlendi/i);

    // Identical repeat — no duplicate notification / version bump
    const dup = await scheduleRecording({
      actorUserId: hostId,
      applicationId,
      date: "2026-09-24",
      time: "19:00",
      timeZone: "Europe/Berlin",
      meetingUrl: "https://meet.example.com/room",
      note: "Bağlantı kayıt saatinden kısa süre önce aktif olabilir.",
    });
    expect(dup.changed).toBe(false);
    expect(
      await db.inAppNotification.count({
        where: { userId: guestId, kind: ARAYANLAR_NOTIF.recordingScheduled },
      }),
    ).toBe(1);
    expect(
      (await db.arayanlarApplication.findUniqueOrThrow({ where: { id: applicationId } }))
        .recordingScheduleVersion,
    ).toBe(1);

    // Reschedule
    const resched = await scheduleRecording({
      actorUserId: hostId,
      applicationId,
      date: "2026-09-25",
      time: "18:00",
      timeZone: "Europe/Berlin",
      meetingUrl: "https://meet.example.com/room-2",
      note: null,
    });
    expect(resched.changed).toBe(true);
    expect(resched.schedule.displayWhen).toMatch(/25 Eylül 2026/);
    const afterResched = await db.arayanlarApplication.findUniqueOrThrow({
      where: { id: applicationId },
    });
    expect(afterResched.recordingScheduleVersion).toBe(2);
    expect(
      await db.inAppNotification.count({
        where: { userId: guestId, kind: ARAYANLAR_NOTIF.recordingRescheduled },
      }),
    ).toBe(1);

    // Invalid meeting URL
    await expect(
      scheduleRecording({
        actorUserId: hostId,
        applicationId,
        date: "2026-09-26",
        time: "19:00",
        timeZone: "Europe/Berlin",
        meetingUrl: "javascript:alert(1)",
      }),
    ).rejects.toMatchObject({ code: "INVALID_MEETING_URL" });

    // Cancel — clears schedule, does not withdraw / touch AI / credits
    const cancelled = await cancelRecordingSchedule({
      actorUserId: hostId,
      applicationId,
    });
    expect(cancelled.changed).toBe(true);
    expect(cancelled.schedule.scheduled).toBe(false);

    const afterCancel = await db.arayanlarApplication.findUniqueOrThrow({
      where: { id: applicationId },
    });
    expect(afterCancel.recordingScheduledAt).toBeNull();
    expect(afterCancel.status).toBe("SUBMITTED");
    expect(afterCancel.prepStatus).toBe("READY");
    expect(afterCancel.withdrawnAt).toBeNull();
    expect(afterCancel.recordingScheduleVersion).toBe(3);

    expect(
      await db.inAppNotification.count({
        where: { userId: guestId, kind: ARAYANLAR_NOTIF.recordingScheduleCancelled },
      }),
    ).toBe(1);

    expect(await db.aiJob.count({ where: { arayanlarApplicationId: applicationId } })).toBe(
      jobsBefore,
    );
    expect(await db.creditLedgerEntry.count({ where: { userId: guestId } })).toBe(creditsBefore);
    expect(await db.arayanlarArtifact.count({ where: { applicationId } })).toBe(1);

    // Cancel again idempotent
    const cancelAgain = await cancelRecordingSchedule({
      actorUserId: hostId,
      applicationId,
    });
    expect(cancelAgain.changed).toBe(false);
    expect(
      await db.inAppNotification.count({
        where: { userId: guestId, kind: ARAYANLAR_NOTIF.recordingScheduleCancelled },
      }),
    ).toBe(1);
  });

  it("host UI sources include schedule controls", () => {
    const form = readFileSync(
      path.join(root, "src/components/arayanlar/host-recording-schedule-form.tsx"),
      "utf8",
    );
    expect(form).toMatch(/Kayıt zamanını belirle/);
    expect(form).toMatch(/Kayıt zamanını güncelle/);
    expect(form).toMatch(/Planlanan kaydı iptal et/);
    expect(form).toMatch(/Tarih/);
    expect(form).toMatch(/Saat dilimi/);
    const notlar = readFileSync(
      path.join(root, "src/app/sunucu/basvurular/[id]/notlar/page.tsx"),
      "utf8",
    );
    expect(notlar).toMatch(/HostRecordingScheduleForm/);
  });
});
