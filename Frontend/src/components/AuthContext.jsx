import React, { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [userRole, setUserRole] = useState("");
  const [token, setToken] = useState("");
  const [fullName, setFullName] = useState("");
  const [userID, setUserID] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Load from session storage on mount and sync across tabs
  useEffect(() => {
    const storedToken = sessionStorage.getItem("token");
    const storedRole = sessionStorage.getItem("userRole");
    const storedFullName = sessionStorage.getItem("fullName");
    const storedUserID = sessionStorage.getItem("userID");

    if (storedToken && storedRole) {
      setToken(storedToken);
      setUserRole(storedRole);
      setFullName(storedFullName || "");
      setUserID(storedUserID || "");
    }
    setIsLoading(false);

    const handleStorageChange = () => {
      const newRole = sessionStorage.getItem("userRole") || "";
      setUserRole(newRole);
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // Login: Update state and storage
  const login = (data) => {
    const { token: newToken, user } = data;
    setToken(newToken);
    setUserRole(user.role.toLowerCase());
    setFullName(user.fullName);
    setUserID(user.userID);

    sessionStorage.setItem("token", newToken);
    sessionStorage.setItem("userRole", user.role.toLowerCase());
    sessionStorage.setItem("fullName", user.fullName);
    sessionStorage.setItem("userID", user.userID);
  };

  // Logout: Clear state and storage
  const logout = () => {
    setToken("");
    setUserRole("");
    setFullName("");
    setUserID("");
    sessionStorage.clear();
  };

  return (
    <AuthContext.Provider value={{ userRole, token, fullName, userID, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};