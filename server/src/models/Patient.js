import mongoose from "mongoose";

const patientSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      trim: true,
      required: true,
    },
    avatar: {
      type: String,
      default: "",
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
    },
    contactInfo: {
      phone: {
        type: String,
        trim: true,
      },
      address: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String,
      },
    },
    medicalHistorySummary: {
      type: String,
      trim: true,
    },
    emergencyContact: {
      fullName: {
        type: String,
        trim: true,
      },
      relationship: {
        type: String,
        trim: true,
      },
      phone: {
        type: String,
        trim: true,
      },
    },
    status: {
      type: String,
      enum: ["unknown", "normal", "warning", "critical"],
      default: "unknown",
    },
    location: {
      address: String, // e.g., "123 Main St, Springfield, IL, USA" or specific facility name
      coordinates: {
        latitude: Number,
        longitude: Number,
      },
      inHospital: {
        type: Boolean,
        default: undefined,
      },
    },
    age: {
      type: Number,
      min: 0, // Ensures age is a non-negative number
    },
    condition: {
      type: String,
      
    },
    additionalInfo: {
      type: String,
      trim: true,
    },
    room: {
      type: String,
      trim: true,
    },
    recentVisits: [
      {
        date: {
          type: Date,
          required: true,
        },
        reason: {
          type: String,
          trim: true,
        },
        doctor: {
          type: String,
          trim: true,
        },
      },
    ],
    
  },
  {
    timestamps: true, // Adds createdAt and updatedAt timestamps
  }
);



const Patient = mongoose.model("Patient", patientSchema);

export default Patient;
