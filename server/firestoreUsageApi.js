const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { MetricServiceClient } = require('@google-cloud/monitoring');

const app = express();
const port = Number(process.env.USAGE_API_PORT || 3001);
const defaultProjectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '';

app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
}));

let monitoringClient = null;

function getMonitoringClient() {
    if (!monitoringClient) {
        monitoringClient = new MetricServiceClient();
    }
    return monitoringClient;
}

function hasApplicationDefaultCredentials() {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return true;

    try {
        const adcPath = path.join(
            process.env.APPDATA || '',
            'gcloud',
            'application_default_credentials.json'
        );
        return !!adcPath && fs.existsSync(adcPath);
    } catch {
        return false;
    }
}

function getPacificDayBounds() {
    const now = new Date();
    const pacificNowString = now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
    const pacificNow = new Date(pacificNowString);
    const pacificStart = new Date(pacificNow);
    pacificStart.setHours(0, 0, 0, 0);

    const startEpochSeconds = Math.floor(
        new Date(
            pacificStart.toLocaleString('en-US', { timeZone: 'UTC' })
        ).getTime() / 1000
    );
    const endEpochSeconds = Math.floor(now.getTime() / 1000);

    return { startEpochSeconds, endEpochSeconds };
}

async function queryMetricTotal(projectId, metricType) {
    const client = getMonitoringClient();
    const { startEpochSeconds, endEpochSeconds } = getPacificDayBounds();
    const request = {
        name: `projects/${projectId}`,
        filter: `metric.type="${metricType}"`,
        interval: {
            startTime: { seconds: startEpochSeconds },
            endTime: { seconds: endEpochSeconds },
        },
        aggregation: {
            alignmentPeriod: { seconds: 60 * 60 * 24 },
            perSeriesAligner: 'ALIGN_SUM',
            crossSeriesReducer: 'REDUCE_SUM',
        },
        view: 'FULL',
    };

    const [timeSeries] = await client.listTimeSeries(request);
    let total = 0;

    for (const series of timeSeries || []) {
        const point = series.points && series.points[0];
        if (!point || !point.value) continue;
        const int64 = point.value.int64Value;
        const double = point.value.doubleValue;
        if (typeof int64 !== 'undefined') {
            total += Number(int64) || 0;
        } else if (typeof double !== 'undefined') {
            total += Number(double) || 0;
        }
    }

    return Math.max(0, Math.floor(total));
}

app.get('/api/firestore-usage', async (req, res) => {
    const projectId = String(req.query.projectId || defaultProjectId).trim();
    if (!projectId) {
        return res.status(400).json({
            error: 'Missing projectId. Provide ?projectId=... or set GCP_PROJECT_ID.',
        });
    }

    if (!hasApplicationDefaultCredentials()) {
        return res.status(500).json({
            error: 'Google credentials not configured. Set GOOGLE_APPLICATION_CREDENTIALS or run gcloud auth application-default login.',
        });
    }

    try {
        const [reads, writes, deletes] = await Promise.all([
            queryMetricTotal(projectId, 'firestore.googleapis.com/document/read_count'),
            queryMetricTotal(projectId, 'firestore.googleapis.com/document/write_count'),
            queryMetricTotal(projectId, 'firestore.googleapis.com/document/delete_count'),
        ]);

        return res.json({
            projectId,
            reads,
            writes,
            deletes,
            asOf: new Date().toISOString(),
            source: 'gcp-monitoring',
        });
    } catch (error) {
        return res.status(500).json({
            error: 'Failed to query Firestore usage metrics.',
            detail: error && error.message ? error.message : String(error),
        });
    }
});

app.listen(port, () => {
    console.log(`Firestore usage API listening on http://localhost:${port}`);
});
