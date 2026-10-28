import { loginLimiter } from '../middleware/privateDemo.js';
import { Router } from "express";
import { login, logout, signup, checkAuth } from "../controllers/authController.js";
import protectedRoute from "../middleware/auth.middleware.js";

const router = Router();

router.post("/signup", signup);

router.post("/login", loginLimiter(), login);

router.get("/check", protectedRoute, checkAuth);

router.post("/logout", protectedRoute, logout);






export default router;

