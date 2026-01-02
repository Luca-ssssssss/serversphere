const mongoose = require('mongoose');
const ServerSchema = new mongoose.Schema({
  name: String,
  path: String,
  port: Number
}, { timestamps: true });
module.exports = mongoose.model('Server', ServerSchema);
