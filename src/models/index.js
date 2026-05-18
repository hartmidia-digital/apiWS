/**
 * Model Index
 * Export all models from a single location
 */

const User = require('./User');
const Session = require('./Session');
const Campaign = require('./Campaign');
const Recipient = require('./Recipient');
const ActivityLog = require('./ActivityLog');
const MediaHandoff = require('./MediaHandoff');

module.exports = {
    User,
    Session,
    Campaign,
    Recipient,
    ActivityLog,
    MediaHandoff
};
