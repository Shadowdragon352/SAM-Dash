import jwt from "jsonwebtoken";
const generateToken = (userId, time, sessionVersion) => {
    return jwt.sign({ userId, ...(sessionVersion ? { sessionVersion } : {}) }, process.env.JWT_SECRET, {
      expiresIn: time, // or '1h', '30m', etc.
      
    });
  };

  export default generateToken;
