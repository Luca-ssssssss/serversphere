module.exports = {
  validateBody: (schema) => (req, res, next) => {
    // ...existing code...
    next();
  }
};