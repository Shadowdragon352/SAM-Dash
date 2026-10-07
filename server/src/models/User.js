import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      default: 'doctor',
    },
    avatarUrl: {
      type: String,
      default:""
    },
    bio: {
      type: String,
      default: '',
      trim: true,
    },
    age:{
      type: Number,
      default: 0,
    },
    experience: {
      type: Number,
      default: 0
    },
    education: {
      type: String,
      default: '',
      trim: true,
    },
    department: {
      type: String,
      default: '',
      trim: true,
    },
    specialty: {
      type: String,
      default: '',
      trim: true,
    },
    
  },
  {
    timestamps: true, // Adds createdAt and updatedAt timestamps
  }
);


const User = mongoose.model('User', userSchema);

export default User;
