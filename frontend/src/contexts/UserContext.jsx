import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';
import WebApp from '@twa-dev/sdk';

// Use environment variable for production, fallback to relative for proxy in dev
axios.defaults.baseURL = import.meta.env.VITE_API_BASE_URL || '';

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [userState, setUserState] = useState({
    group: localStorage.getItem('bsuir_group') || null,
    subgroup: parseInt(localStorage.getItem('bsuir_subgroup') || '0', 10),
    studentId: localStorage.getItem('bsuir_student_id') || null,
    isInitializing: true,
  });

  const telegramId = WebApp.initDataUnsafe?.user?.id || 123456789;

  useEffect(() => {
    // Fetch latest user preferences from the backend
    axios.get(`/api/users/${telegramId}`)
      .then(res => {
        if (res.data.bsuir_group || res.data.bsuir_id) {
          setUserState(prev => ({ 
            ...prev, 
            group: res.data.bsuir_group, 
            subgroup: res.data.bsuir_subgroup || 0, 
            studentId: res.data.bsuir_id,
            isInitializing: false 
          }));
          if (res.data.bsuir_group) localStorage.setItem('bsuir_group', res.data.bsuir_group);
          localStorage.setItem('bsuir_subgroup', (res.data.bsuir_subgroup || 0).toString());
          if (res.data.bsuir_id) localStorage.setItem('bsuir_student_id', res.data.bsuir_id);
        } else {
          setUserState(prev => ({ ...prev, isInitializing: false }));
        }
      })
      .catch(err => {
        console.error("Failed to fetch user state", err);
        setUserState(prev => ({ ...prev, isInitializing: false }));
      });
  }, [telegramId]);

  const updatePreferences = async (group, subgroup, studentId = null) => {
    try {
      const res = await axios.put(`/api/users/${telegramId}/preferences`, {
        bsuir_group: group || null,
        bsuir_subgroup: subgroup,
        bsuir_id: studentId || null
      });
      setUserState(prev => ({ ...prev, group: res.data.bsuir_group, subgroup: res.data.bsuir_subgroup, studentId: res.data.bsuir_id }));
      if (res.data.bsuir_group) localStorage.setItem('bsuir_group', res.data.bsuir_group);
      localStorage.setItem('bsuir_subgroup', res.data.bsuir_subgroup.toString());
      if (res.data.bsuir_id) localStorage.setItem('bsuir_student_id', res.data.bsuir_id);
      return true;
    } catch (e) {
      console.error("Failed to update preferences", e);
      return false;
    }
  };

  return (
    <UserContext.Provider value={{ ...userState, updatePreferences, telegramId }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
