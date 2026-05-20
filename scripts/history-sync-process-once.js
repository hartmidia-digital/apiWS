require('dotenv').config();
const historySyncWorker = require('../src/services/historySyncWorker');

console.log('--- History Sync Process Once ---');
console.log('Running a single dispatch cycle...');

(async () => {
    // Process regardless of flag for manual override execution
    try {
        await historySyncWorker.processItems();
        console.log('Cycle completed successfully.');
    } catch (error) {
        console.error('Error during cycle:', error.message);
    }
    process.exit(0);
})();
