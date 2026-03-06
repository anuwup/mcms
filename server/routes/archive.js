const express = require('express');
const router = express.Router();
const Agenda = require('../models/Agenda');
const ActionItem = require('../models/ActionItem');
const ResourcePin = require('../models/ResourcePin');
const Transcript = require('../models/Transcript');

module.exports = function ({ Meeting, protect, usingMongo, callAISummarize }) {

    router.get('/', protect, async (req, res) => {
        try {
            if (!usingMongo() || !Meeting) return res.json([]);

            const { q, agendaTitle, dateFrom, dateTo } = req.query;
            const meetingFilter = { status: 'completed' };

            if (dateFrom || dateTo) {
                const dateRange = {};
                if (dateFrom) dateRange.$gte = dateFrom;
                if (dateTo) {
                    const toDate = new Date(dateTo);
                    toDate.setDate(toDate.getDate() + 1);
                    dateRange.$lt = toDate.toISOString().slice(0, 10);
                }
                meetingFilter.$or = [
                    { confirmedDate: dateRange },
                    { date: dateRange },
                ];
            }

            if (q) {
                const titleFilter = { title: { $regex: q, $options: 'i' } };

                const transcriptMeetingIds = await Transcript.distinct('meetingId', {
                    text: { $regex: q, $options: 'i' },
                });

                const qOr = [titleFilter];
                if (transcriptMeetingIds.length) {
                    qOr.push({ _id: { $in: transcriptMeetingIds } });
                }

                if (meetingFilter.$or) {
                    meetingFilter.$and = [{ $or: meetingFilter.$or }, { $or: qOr }];
                    delete meetingFilter.$or;
                } else {
                    meetingFilter.$or = qOr;
                }
            }

            let meetings = await Meeting.find(meetingFilter)
                .sort({ createdAt: -1 })
                .populate('participants', 'name email')
                .limit(50);

            const results = [];
            for (const m of meetings) {
                const matchedTranscripts = q
                    ? await Transcript.find({
                        meetingId: m._id,
                        text: { $regex: q, $options: 'i' },
                    }).limit(3).select('text speaker timestamp agendaItemId')
                    : [];

                let agendaMatch = true;
                let agendaItems = [];
                if (agendaTitle) {
                    const agenda = await Agenda.findOne({ meetingId: m._id });
                    if (agenda) {
                        agendaItems = agenda.items.filter(i => i.title.toLowerCase().includes(agendaTitle.toLowerCase()));
                        agendaMatch = agendaItems.length > 0;
                    } else {
                        agendaMatch = false;
                    }
                }

                if (!agendaMatch) continue;

                results.push({
                    id: m._id, title: m.title, modality: m.modality,
                    date: m.confirmedDate || m.date,
                    time: m.confirmedTime || m.time,
                    host: m.host, hostId: m.hostId,
                    participants: m.participants,
                    matchedTranscripts: matchedTranscripts.map(t => ({
                        text: t.text, speaker: t.speaker,
                        timestamp: t.timestamp, agendaItemId: t.agendaItemId,
                    })),
                    matchedAgendaItems: agendaItems.map(i => ({ id: i.id, title: i.title })),
                });
            }

            res.json(results);
        } catch (error) {
            res.status(500).json({ message: 'Server error', error: error.message });
        }
    });

    router.get('/:meetingId', protect, async (req, res) => {
        try {
            if (!usingMongo()) return res.json(null);

            const meeting = await Meeting.findById(req.params.meetingId).populate('participants', 'name email');
            if (!meeting) return res.status(404).json({ message: 'Meeting not found' });

            const agenda = await Agenda.findOne({ meetingId: req.params.meetingId });
            const transcripts = await Transcript.find({ meetingId: req.params.meetingId }).sort({ createdAt: 1 });
            const actionItems = await ActionItem.find({ meetingId: req.params.meetingId }).populate('assignee', 'name email');
            const pins = await ResourcePin.find({ meetingId: req.params.meetingId }).populate('userId', 'name');

            const transcriptsByAgenda = {};
            for (const t of transcripts) {
                const key = t.agendaItemId || '_unlinked';
                if (!transcriptsByAgenda[key]) transcriptsByAgenda[key] = [];
                transcriptsByAgenda[key].push({
                    id: t._id, speaker: t.speaker, speakerImage: t.speakerImage,
                    text: t.text, timestamp: t.timestamp, sentiment: t.sentiment,
                });
            }

            res.json({
                meeting: {
                    id: meeting._id, title: meeting.title, modality: meeting.modality,
                    date: meeting.confirmedDate || meeting.date,
                    time: meeting.confirmedTime || meeting.time,
                    host: meeting.host, participants: meeting.participants,
                },
                agendaItems: agenda ? agenda.items : [],
                transcriptsByAgenda,
                actionItems: actionItems.map(i => ({
                    id: i._id, title: i.title,
                    assignee: i.assigneeName || i.assignee?.name || 'Unassigned',
                    category: i.category, status: i.status, deadline: i.deadline,
                    source: i.source,
                })),
                pins: pins.map(p => ({
                    id: p._id, type: p.type, url: p.url, content: p.content,
                    metadata: p.metadata, label: p.label,
                    transcriptTimestamp: p.transcriptTimestamp,
                    user: p.userId?.name,
                })),
            });
        } catch (error) {
            res.status(500).json({ message: 'Server error', error: error.message });
        }
    });

    router.get('/:meetingId/summary', protect, async (req, res) => {
        try {
            if (!usingMongo()) return res.json({ summaries: {} });

            const agenda = await Agenda.findOne({ meetingId: req.params.meetingId });
            const transcripts = await Transcript.find({ meetingId: req.params.meetingId }).sort({ createdAt: 1 });

            if (!agenda || !transcripts.length) {
                return res.json({ summaries: {} });
            }

            if (callAISummarize) {
                try {
                    const summaries = await callAISummarize(
                        transcripts.map(t => ({ text: t.text, speaker: t.speaker, agendaItemId: t.agendaItemId })),
                        agenda.items.map(i => ({ id: i.id, title: i.title }))
                    );
                    return res.json({ summaries });
                } catch (e) {
                    console.error('AI summarize failed, using fallback:', e.message);
                }
            }

            const summaries = {};
            for (const item of agenda.items) {
                const segments = transcripts.filter(t => t.agendaItemId === item.id);
                summaries[item.id] = segments.length > 0
                    ? `${segments.length} segment(s) discussed. Key speakers: ${[...new Set(segments.map(s => s.speaker))].join(', ')}.`
                    : 'No discussion recorded for this item.';
            }
            res.json({ summaries });
        } catch (error) {
            res.status(500).json({ message: 'Server error', error: error.message });
        }
    });

    return router;
};
