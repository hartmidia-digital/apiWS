require('dotenv').config();
const { db } = require('../src/config/database');
const fs = require('fs');

const tempRoot = process.env.MEDIA_HANDOFF_TEMP_ROOT || '/tmp';

console.log('--- Media Handoff Health Report ---');

const counts = db.prepare(`SELECT status, COUNT(*) as count FROM media_handoffs GROUP BY status`).all();
const total = counts.reduce((acc, c) => acc + c.count, 0);

console.log(`Total Handoffs: ${total}`);
counts.forEach(c => {
    console.log(`- ${c.status}: ${c.count}`);
});

let folderSize = 0;
try {
    const files = fs.readdirSync(tempRoot);
    files.forEach(file => {
        const stats = fs.statSync(`${tempRoot}/${file}`);
        folderSize += stats.size;
    });
    console.log(`\nTemp Folder Size: ${(folderSize / 1024 / 1024).toFixed(2)} MB`);
} catch (e) {
    console.log(`\nTemp Folder Size: Error reading folder (${e.message})`);
}

const errors = db.prepare(`SELECT handoff_id, status, error_message FROM media_handoffs WHERE status = 'failed' LIMIT 5`).all();
if (errors.length > 0) {
    console.log('\n--- Recent Errors ---');
    errors.forEach(e => {
        console.log(`ID: ${e.handoff_id} | Error: ${e.error_message || 'N/A'}`);
    });
}
