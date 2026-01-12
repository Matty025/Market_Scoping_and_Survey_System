import React, { useEffect, useState } from "react";
import api from "../../api";
import "./Profile.css";

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/supplier-files/profile");
      setProfile(res.data);
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to load profile.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const res = await api.post("/api/supplier-files/profile/avatar", formData);
      setProfile((prev) => prev ? { ...prev, profileImageUrl: res.data.profileImageUrl } : prev);
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to update profile picture.";
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="profile-card">Loading profile...</div>;
  if (error) return <div className="profile-card error">{error}</div>;
  if (!profile) return <div className="profile-card">No profile data.</div>;

  const { fullName, role, email, categories = [], location, totalProducts, joinedAt, profileImageUrl, companyName } = profile;

  return (
    <div className="profile-card">
      <div className="profile-header">
        <div className="avatar-wrap">
          <img
            src={profileImageUrl || "https://via.placeholder.com/120x120.png?text=Avatar"}
            alt="Profile"
            className="avatar"
          />
          <label className="avatar-upload">
            <input type="file" accept="image/*" onChange={handleAvatarChange} disabled={uploading} />
            {uploading ? "Uploading..." : "Change photo"}
          </label>
        </div>
        <div className="profile-main">
          <h2>{companyName || fullName}</h2>
          <p className="muted">{role || "Supplier"}</p>
          <p>{email}</p>
        </div>
      </div>

      <div className="profile-grid">
        <div className="profile-field">
          <span className="label">Categories</span>
          <span>{categories.length ? categories.join(", ") : "—"}</span>
        </div>
        <div className="profile-field">
          <span className="label">Location</span>
          <span>{location || "—"}</span>
        </div>
        <div className="profile-field">
          <span className="label">Total Products</span>
          <span>{totalProducts ?? 0}</span>
        </div>
        <div className="profile-field">
          <span className="label">Date Joined</span>
          <span>{joinedAt ? new Date(joinedAt).toLocaleDateString() : "—"}</span>
        </div>
      </div>
    </div>
  );
}
