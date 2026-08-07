function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const message = result.error.issues[0]?.message || 'Invalid input';
      return res.status(400).json({ error: message });
    }
    req[source] = result.data;
    next();
  };
}

module.exports = { validate };
