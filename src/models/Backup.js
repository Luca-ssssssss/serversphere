const mongoose = require('mongoose');
const BackupSchema = new mongoose.Schema({
  server: { type: mongoose.Schema.Types.ObjectId, ref: 'Server' },
  file: String,
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Backup', BackupSchema);
