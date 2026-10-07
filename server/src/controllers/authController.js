import { secretMatches, hashToken } from '../delirium/contract.js';
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import AppError from "../utils/AppError.js";
import  generateToken  from "../utils/generateToken.js";
export const signup = async (req, res, next) => {
  try {
    const { fullName, password, department, specialty } = req.body;
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!process.env.REGISTRATION_CODE || !secretMatches(String(req.body.registrationCode || ''), hashToken(process.env.REGISTRATION_CODE))) {
      return next(new AppError('A valid registration code from the server operator is required', 403));
    }
    // check if user already exists
    // check all find is provided
    if (typeof fullName !== 'string' || !fullName.trim() || fullName.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) {
      return next(new AppError("Please provide all fields", 400));
    }
    // check if password is strong
    if (typeof password !== 'string' || password.length < 8 || password.length > 256) {
      return next(
        new AppError("Password must be at least 8 characters long", 400)
      );
    }
    const userExists = await User.findOne({ email });
    if (userExists) {
      return next(new AppError("User already exists", 400));
    }
    // hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    // create user
    const user = new User({
      fullName,
      email,
      password: hashedPassword,
      role: "doctor", // default role is doctor
      department: department || "",
      specialty: specialty || "",
    });
    // save user to db
    // verify email 
    const token = generateToken(user._id, "1h");
    await user.save();
 
    
    
    // generate token
    // exclude password from user object
    const { password: excludedPassword, ...userInfo } = user._doc;
    // send token in cookie

    res
      .cookie("token", token, {
        httpOnly: true,
        secure: process.env.COOKIE_SECURE === 'true',
        maxAge: 60 * 60 * 1000,
        sameSite: "strict",
      })
      .status(201)
      .json({
        success: true,
        message: "User created successfully",
        ...userInfo,
      });
  } catch (error) {
    next(new AppError(error.message || "internal server error!", 500));
  }
};

export const login = async (req, res, next) => {
  try {
    const { password } = req.body;
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    // check email and password are provided
    if (!email || typeof password !== 'string' || !password || password.length > 256) {
      return next(new AppError("Please provide all fields", 400));
    }
    // check if user exists
    const userExists = await User.findOne({ email });
    if (!userExists) {
      // tell them wrong  credentials
      return next(new AppError("Wrong email or password", 400));
    }
    // check if password is correct
    const isPasswordCorrect = await bcrypt.compare(password, userExists.password);
    if (!isPasswordCorrect) {
      return next(new AppError("Wrong email or password", 400));
    }
    // generate token
    const token = generateToken(userExists._id, "1h");
    // exclude password from user object
    const { password: excludedPassword, ...userInfo } = userExists._doc;
    // send token in cookie
    res
      .cookie("token", token, {
        httpOnly: true,
        secure: process.env.COOKIE_SECURE === 'true',
        maxAge: 60 * 60 * 1000,
        sameSite: "strict",
      })
      .status(200)
      .json({
        success: true,
        message: "User logged in successfully",
        ...userInfo,
      });
  } catch (error) {
    next(new AppError(error.message || "internal server error!", 500));
  }
};


export const logout = async (req, res, next) => {
  try {
    res
      .clearCookie("token", {
        httpOnly: true,
        secure: process.env.COOKIE_SECURE === 'true',
        maxAge: 60 * 60 * 1000,
        sameSite: "strict",
      })
      .status(200)
      .json({
        success: true,
        message: "User logged out successfully",
      });
  } catch (error) {
    next(new AppError(error.message || "internal server error!", 500));
  }
};
export const updateProfile = async (req, res, next) => {
  try {
    const { profilePic } = req.body;

    // check if user exists
    const userExists = await User.findById(req.user._id);
    // check if user won't exist
    if (!userExists) {
      return next(new AppError("User not found", 400));
    }
    const uploadResponse = await cloudinary.uploader.upload(profilePic);

    // update user
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      {
        profilePic: uploadResponse.secure_url || userExists.profilePic,
      },
      { new: true }
    );
    // exclude password from user object
    const { password: excludedPassword, ...userInfo } = updatedUser._doc;
    // upsert stream user
   
    // send token in cookies

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      ...userInfo,
    });
  } catch (error) {
    next(new AppError(error.message || "internal server error!", 500));
  }
};
export const checkAuth = async (req, res, next) => {
  try {
    // check if user exists
    const userExists = req.user;
    // check if user won't exist
    if (!userExists) {
      return next(new AppError("User not found", 400));
    }
    // exclude password from user object
    // send token in cookie
    res.status(200).json({
      success: true,
      message: "Auth is made successfully",
      ...userExists._doc,
    });
  } catch (error) {
    next(new AppError(error.message || "internal server error!", 500));
  }
};
