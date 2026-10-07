import bcrypt from 'bcryptjs';
import User from '../models/User.js';
// Optional: Import Patient and Doctor models if you want to populate linked profiles
// import Patient from '../models/Patient.js';
// import Doctor from '../models/Doctor.js';

// @desc    Get current user's profile
// @route   GET /api/v1/users/me
// @access  Private
export const getMe = async (req, res) => {
  try {
    // req.user is populated by the 'protect' middleware
    // Fetch fresh data, excluding the password
    const user = await User.findById(req.user._id).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Optional: Populate patient/doctor profile if it exists
    // let patientProfile = null;
    // let doctorProfile = null;
    // if (user.role === 'patient') {
    //   patientProfile = await Patient.findOne({ userId: user._id });
    // } else if (user.role === 'doctor') {
    //   doctorProfile = await Doctor.findOne({ userId: user._id });
    // }

    res.json({
      _id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      // patientProfile, // Uncomment if implementing optional enhancement
      // doctorProfile, // Uncomment if implementing optional enhancement
    });
  } catch (error) {
    console.error('GetMe Error:', error);
    res.status(500).json({ message: 'Server error fetching user profile.' });
  }
};

// @desc    Update current user's profile
// @route   PUT /api/v1/users/me
// @access  Private
export const updateMe = async (req, res) => {
  const { firstName, lastName, password, avatarUrl } = req.body;

  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Update allowed fields
    // Email and role changes are typically handled by more specific admin processes
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (avatarUrl) user.avatarUrl = avatarUrl;

    // If password is provided, it will be hashed by the pre-save hook in User.js
    if (password) {
      if (password.length < 6) { // Example: Minimum password length validation
          return res.status(400).json({ message: 'Password must be at least 6 characters long.'})
      }
      user.password = await bcrypt.hash(password, 10);
    }

    const updatedUser = await user.save();

    res.json({
      _id: updatedUser._id,
      email: updatedUser.email,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      role: updatedUser.role,
      avatarUrl: updatedUser.avatarUrl,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
    });
  } catch (error) {
    console.error('UpdateMe Error:', error);
    res.status(500).json({ message: 'Server error updating user profile.' });
  }
};
