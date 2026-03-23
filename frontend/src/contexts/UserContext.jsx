import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';
import WebApp from '@twa-dev/sdk';
import { getApiBaseUrl } from '../utils/apiClient';

// Use VITE_BACKEND_URL in production (Vercel → Railway), fallback to '' for
// local dev where the Vite proxy rewrites /api/* to localhost:8000.
axios.defaults.baseURL = getApiBaseUrl();

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [userState, setUserState] = useState({
    group: localStorage.getItem('bsuir_group') || null,
    subgroup: parseInt(localStorage.getItem('bsuir_subgroup') || '0', 10),
    studentId: localStorage.getItem('bsuir_student_id') || null,
    isTeacher: localStorage.getItem('bsuir_is_teacher') === 'true',
    teacherUrlId: localStorage.getItem('bsuir_teacher_url_id') || null,
    englishTeacherId: localStorage.getItem('bsuir_english_teacher_id') || null,
    englishTeacherFio: localStorage.getItem('bsuir_english_teacher_fio') || null,
    isInitializing: true,
  });

  const telegramId = WebApp.initDataUnsafe?.user?.id || 123456789;

  useEffect(() => {
    // Fetch latest user preferences from the backend
    axios.get(`/api/users/${telegramId}`)
      .then(res => {
        const hasData = res.data.bsuir_group || res.data.bsuir_id || res.data.is_teacher;
        if (hasData) {
          setUserState(prev => ({ 
            ...prev, 
            group: res.data.bsuir_group, 
            subgroup: res.data.bsuir_subgroup || 0, 
            studentId: res.data.bsuir_id,
            isTeacher: res.data.is_teacher,
            teacherUrlId: res.data.teacher_url_id,
            englishTeacherId: res.data.english_teacher_id,
            englishTeacherFio: res.data.english_teacher_fio,
            isInitializing: false 
          }));
          if (res.data.bsuir_group) localStorage.setItem('bsuir_group', res.data.bsuir_group);
          localStorage.setItem('bsuir_subgroup', (res.data.bsuir_subgroup || 0).toString());
          if (res.data.bsuir_id) localStorage.setItem('bsuir_student_id', res.data.bsuir_id);
          localStorage.setItem('bsuir_is_teacher', String(res.data.is_teacher));
          if (res.data.teacher_url_id) localStorage.setItem('bsuir_teacher_url_id', res.data.teacher_url_id);
          if (res.data.english_teacher_id) localStorage.setItem('bsuir_english_teacher_id', (res.data.english_teacher_id || '').toString());
          if (res.data.english_teacher_fio) localStorage.setItem('bsuir_english_teacher_fio', (res.data.english_teacher_fio || '').toString());
        } else {
          setUserState(prev => ({ ...prev, isInitializing: false }));
        }
      })
      .catch(err => {
        console.error("Failed to fetch user state", err);
        setUserState(prev => ({ ...prev, isInitializing: false }));
      });
  }, [telegramId]);

  const updatePreferences = async (group, subgroup, studentId = null, isTeacherParam = undefined, teacherUrlIdParam = undefined, englishTeacherIdParam = undefined, englishTeacherFioParam = undefined) => {
    try {
      const res = await axios.put(`/api/users/${telegramId}/preferences`, {
        bsuir_group: group || null,
        bsuir_subgroup: subgroup,
        bsuir_id: studentId || null,
        is_teacher: isTeacherParam !== undefined ? isTeacherParam : userState.isTeacher,
        teacher_url_id: teacherUrlIdParam !== undefined ? teacherUrlIdParam : userState.teacherUrlId,
        english_teacher_id: englishTeacherIdParam !== undefined ? englishTeacherIdParam : userState.englishTeacherId,
        english_teacher_fio: englishTeacherFioParam !== undefined ? englishTeacherFioParam : userState.englishTeacherFio
      });
      setUserState(prev => ({ 
        ...prev, 
        group: res.data.bsuir_group, 
        subgroup: res.data.bsuir_subgroup, 
        studentId: res.data.bsuir_id,
        isTeacher: res.data.is_teacher,
        teacherUrlId: res.data.teacher_url_id,
        englishTeacherId: res.data.english_teacher_id,
        englishTeacherFio: res.data.english_teacher_fio
      }));
      if (res.data.bsuir_group) localStorage.setItem('bsuir_group', res.data.bsuir_group);
      localStorage.setItem('bsuir_subgroup', res.data.bsuir_subgroup.toString());
      if (res.data.bsuir_id) localStorage.setItem('bsuir_student_id', res.data.bsuir_id);
      localStorage.setItem('bsuir_is_teacher', String(res.data.is_teacher));
      if (res.data.teacher_url_id) localStorage.setItem('bsuir_teacher_url_id', res.data.teacher_url_id);
      if (res.data.english_teacher_id) localStorage.setItem('bsuir_english_teacher_id', res.data.english_teacher_id);
      if (res.data.english_teacher_fio) localStorage.setItem('bsuir_english_teacher_fio', res.data.english_teacher_fio);
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
