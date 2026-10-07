const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.statusCode || err.status || (err.name === 'ValidationError' || err.name === 'CastError' ? 400 : err.code === 11000 ? 409 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ success: false, message: status >= 500 && process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message });
};
export default errorHandler;
