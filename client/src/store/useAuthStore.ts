/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from "zustand";
import { axiosInstance } from "../lib/axios";
import { toast } from "@/components/ui/sonner";

// Types
interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
  department: string;
  specialty: string;
  avatarUrl: string; // Optional field for user avatar
  phoneNumber: string; // Optional field for user phone number
  bio: string; 
  age: number; // Optional field for user age
  experience: number; // Optional field for user experience
  education: string; // Optional field for user education

  // Add more fields as needed
}

interface SignupData {
  registrationCode: string;
  fullName: string;
  email: string;
  password: string;
  role:string;
  department: string;
  specialty: string;
}

interface LoginData {
  email: string;
  password: string;
}

interface UpdateProfileData {
  name?: string;
  email?: string;
  password?: string;
}

interface AuthStore {
  authUser: AuthUser | null;
  user: AuthUser | null;
  isSigningUp: boolean;
  isLoggingIn: boolean;
  isUpdatingProfile: boolean;
  isCheckingAuth: boolean;

  checkAuth: () => Promise<void>;
  signup: (data: SignupData) => Promise<void>;
  login: (data: LoginData) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: UpdateProfileData) => Promise<void>;
  getUser: (id: string) => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  authUser: null,
  user: null,
  isSigningUp: false,
  isLoggingIn: false,
  isUpdatingProfile: false,
  isCheckingAuth: true,

  checkAuth: async () => {
    try {
      const res = await axiosInstance.get("/auth/check");
      if (res.status === 200) {
        set({ authUser: res.data, isCheckingAuth: false });
      } else {
        set({ isCheckingAuth: false });
      }
    } catch (error: any) {
      console.error(error.response?.data?.message || error.message);
      set({ authUser: null, isCheckingAuth: false });
    } finally {
      set({ isCheckingAuth: false });
    }
  },

  signup: async (data: SignupData) => {
    set({ isSigningUp: true });
    try {
      const res = await axiosInstance.post("/auth/signup", data);
      if (res.status === 201) {
        set({ authUser: res.data });
        toast.success("Account created successfully!");
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Signup failed.");
      console.error("Error signing up:", error);
    } finally {
      set({ isSigningUp: false });
    }
  },

  login: async (data: LoginData) => {
    set({ isLoggingIn: true });
    try {
      const res = await axiosInstance.post("/auth/login", data);
      if (res.status === 200) {
        set({ authUser: res.data });
        toast.success("Logged in successfully!");
      }
    } catch (error: any) {
      if (error.response?.status === 429) {
        toast.error(error.response.data || "Too many requests.");
        return;
      }
      console.log("Login error:", error);
      // toast.success("Login failed.");
      toast.error(error.response?.data?.message || "Login failed.");
      console.error("Error logging in:", error);
    } finally {
      set({ isLoggingIn: false });
    }
  },

  logout: async () => {
    try {
      const res = await axiosInstance.post("/auth/logout");
      set({ authUser: null });
      toast.success(res.data.message);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Logout failed.");
      console.error("Error logging out:", error);
    } finally {
      set({ authUser: null });
    }
  },

  updateProfile: async (data: UpdateProfileData) => {
    set({ isUpdatingProfile: true });
    try {
      const res = await axiosInstance.put("/auth/update-profile", data);
      if (res.status === 200) {
        set({ authUser: res.data });
        toast.success("Profile updated successfully!");
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Update failed.");
      console.error("Error updating profile:", error);
    } finally {
      set({ isUpdatingProfile: false });
    }
  },

  getUser: async (id: string) => {
    try {
      const res = await axiosInstance.get(`/users/${id}`);
      if (res.status === 200) {
        set({ user: res.data });
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to get user.");
      console.error("Error getting user:", error);
    }
  },
}));

