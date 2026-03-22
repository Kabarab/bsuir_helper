import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Circle, CheckCircle2, Calendar, Edit2, Trash2, PlusCircle, X, Check, Bell, Clock } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { getMinskNow } from '../utils/minskTime';

/* ── Segmented Date Input (DD / MM / YYYY) with auto‑jump ── */
function SegmentedDateInput({ value, onChange }) {
  // value is "YYYY-MM-DD" or ""
  const dayRef = useRef(null);
  const monthRef = useRef(null);
  const yearRef = useRef(null);

  const parse = (v) => {
    if (!v) return { dd: '', mm: '', yyyy: '' };
    const [y, m, d] = v.split('-');
    return { dd: d || '', mm: m || '', yyyy: y || '' };
  };

  const [seg, setSeg] = useState(() => parse(value));

  useEffect(() => {
    setSeg(parse(value));
  }, [value]);

  const emit = useCallback((next) => {
    const { dd, mm, yyyy } = next;
    if (dd && mm && yyyy && dd.length === 2 && mm.length === 2 && yyyy.length === 4) {
      onChange(`${yyyy}-${mm}-${dd}`);
    } else if (!dd && !mm && !yyyy) {
      onChange('');
    }
  }, [onChange]);

  const handleChange = (field, raw, maxLen, nextRef) => {
    let v = raw.replace(/\D/g, '').slice(0, maxLen);
    const next = { ...seg, [field]: v };
    setSeg(next);
    emit(next);
    if (v.length === maxLen && nextRef?.current) {
      nextRef.current.focus();
      nextRef.current.select();
    }
  };

  const handleKeyDown = (field, e, prevRef) => {
    if (e.key === 'Backspace' && seg[field] === '' && prevRef?.current) {
      prevRef.current.focus();
    }
  };

  const inputCls = 'bg-transparent text-center text-tg-text font-semibold outline-none';
  const separatorCls = 'text-tg-hint font-bold select-none';

  return (
    <div className="flex items-center gap-0 w-full px-3 py-2.5 rounded-xl bg-tg-bg focus-within:ring-2 focus-within:ring-tg-button border border-transparent min-h-[44px]">
      <input
        ref={dayRef}
        type="text"
        inputMode="numeric"
        placeholder="ДД"
        maxLength={2}
        value={seg.dd}
        onChange={(e) => handleChange('dd', e.target.value, 2, monthRef)}
        onKeyDown={(e) => handleKeyDown('dd', e, null)}
        onFocus={(e) => e.target.select()}
        className={`${inputCls} w-[28px]`}
      />
      <span className={separatorCls}>/</span>
      <input
        ref={monthRef}
        type="text"
        inputMode="numeric"
        placeholder="ММ"
        maxLength={2}
        value={seg.mm}
        onChange={(e) => handleChange('mm', e.target.value, 2, yearRef)}
        onKeyDown={(e) => handleKeyDown('mm', e, dayRef)}
        onFocus={(e) => e.target.select()}
        className={`${inputCls} w-[28px]`}
      />
      <span className={separatorCls}>/</span>
      <input
        ref={yearRef}
        type="text"
        inputMode="numeric"
        placeholder="ГГГГ"
        maxLength={4}
        value={seg.yyyy}
        onChange={(e) => handleChange('yyyy', e.target.value, 4, null)}
        onKeyDown={(e) => handleKeyDown('yyyy', e, monthRef)}
        onFocus={(e) => e.target.select()}
        className={`${inputCls} w-[44px]`}
      />
    </div>
  );
}

export default function Planner() {
  const { group, telegramId, isTeacher, teacherUrlId } = useUser();

  const [tasks, setTasks] = useState(() => {
    try {
      const saved = localStorage.getItem('bsuir_tasks');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Failed to load tasks from localStorage:', e);
      return [];
    }
  });
  const [filter, setFilter] = useState('all'); // all, active, completed, overdue
  const [sort, setSort] = useState('newest'); // newest, oldest, priority
  
  // Schedule integration
  const [scheduleEvents, setScheduleEvents] = useState([]);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentTask, setCurrentTask] = useState({ id: null, title: '', description: '', priority: 'medium', due_date: '', due_time: '', linkedEventId: null, reminders: [] });
  const modalContentRef = useRef(null);

  const fetchEventsForDate = (dateStr) => {
    if (!dateStr) return;
    const targetKey = isTeacher ? teacherUrlId : group;
    if (!targetKey) return;

    const targetDate = new Date(dateStr);
    const bsuirDayNames = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
    const dayName = bsuirDayNames[targetDate.getDay()];
    
    const url = isTeacher ? `/api/bsuir/teachers/${targetKey}/schedule` : `/api/bsuir/schedule/${targetKey}`;
    axios.get(url)
      .then(res => {
        if (res.data?.schedules && res.data.schedules[dayName]) {
          setScheduleEvents(res.data.schedules[dayName]);
        }
      })
      .catch(console.error);
  };

  useEffect(() => {
    localStorage.setItem('bsuir_tasks', JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'bsuir_tasks') {
        try {
          const parsed = JSON.parse(e.newValue);
          setTasks(Array.isArray(parsed) ? parsed : []);
        } catch (err) { console.error(err); }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const syncToLocalStorage = (taskList) => {
    localStorage.setItem('bsuir_tasks', JSON.stringify(taskList));
    window.dispatchEvent(new Event('storage'));
  };

  const refreshTasks = () => {
    if (!telegramId) return;
    axios.get(`/api/tasks/${telegramId}`)
      .then(res => {
        const data = Array.isArray(res.data) ? res.data : [];
        setTasks(data);
        syncToLocalStorage(data);
      })
      .catch(err => {
        console.error("Refresh tasks error:", err);
        const url = err.config?.url || 'unknown url';
        const status = err.response?.status || 'No Status';
        const msg = err.response?.data?.detail || err.message || "Сервер не ответил";
        if (window.Telegram?.WebApp) {
           // Silently log or simple toast? Let's show alert for diagnostics
           window.Telegram.WebApp.showAlert(`Ошибка загрузки [GET ${url}] (Status: ${status}): ${msg}`);
        }
      });
  };

  useEffect(() => {
    if (!telegramId) return;
    refreshTasks();
    fetchEventsForDate(getMinskNow().toISOString().split('T')[0]);
  }, [telegramId, group]);

  useEffect(() => {
    if (currentTask.due_date) {
      fetchEventsForDate(currentTask.due_date);
    }
  }, [currentTask.due_date]);

  const handleOpenModal = (task = null) => {
    if (task) {
      let reminders = [];
      if (task.reminders) {
        try {
          reminders = typeof task.reminders === 'string' ? JSON.parse(task.reminders) : task.reminders;
        } catch (e) {
          console.error('Failed to parse reminders:', e);
        }
      }
      setCurrentTask({ ...task, due_time: task.due_time || '', reminders: Array.isArray(reminders) ? reminders : [] });
    } else {
      setCurrentTask({ id: null, title: '', description: '', priority: 'medium', due_date: '', due_time: '', linkedEventId: null, reminders: [] });
    }
    setIsModalOpen(true);
    // Scroll to top when opening
    setTimeout(() => {
      if (modalContentRef.current) {
        modalContentRef.current.scrollTop = 0;
      }
    }, 100);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleSaveTask = () => {
    if (!currentTask.title.trim()) {
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("Пожалуйста, введите название задачи");
      } else {
        alert("Пожалуйста, введите название задачи");
      }
      return;
    }

    if (!telegramId) {
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("Ошибка: ID пользователя не найден. Перезапустите приложение.");
      } else {
        alert("Ошибка: ID пользователя не найден.");
      }
      return;
    }
    setIsSaving(true);
    
    if (!currentTask.title?.trim()) {
      setIsSaving(false);
      const msg = "Пожалуйста, введите название задачи";
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(msg);
      } else {
        alert(msg);
      }
      return;
    }

    if (!telegramId) {
      setIsSaving(false);
      const msg = "Ошибка: ID пользователя не найден. Перезапустите приложение.";
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(msg);
      } else {
        alert(msg);
      }
      return;
    }
    
    // Map frontend fields to backend schema
    const { id, ...payloadWithoutId } = currentTask;
    const taskPayload = {
      title: currentTask.title,
      description: currentTask.description,
      priority: currentTask.priority,
      due_date: currentTask.due_date,
      due_time: currentTask.due_time,
      subject: currentTask.subject,
      linkedEventId: currentTask.linkedEventId,
      reminders: (currentTask.reminders || []).length > 0 ? JSON.stringify(currentTask.reminders) : null
    };

    const config = { timeout: 15000 };

    if (currentTask.id) {
      axios.put(`/api/tasks/${currentTask.id}`, taskPayload, config)
        .then(res => {
          setTasks(prev => prev.map(t => t.id == currentTask.id ? res.data : t));
          handleCloseModal();
        })
        .catch(err => {
          console.error("PUT Task Error:", err, err.response);
          const url = err.config?.url || 'unknown url';
          const status = err.response?.status || 'No Status';
          const msg = err.response?.data?.detail || err.message || "Сервер не ответил";
          const help = status === 422 ? "\n(Ошибка валидации данных. Проверьте поля.)" : status === 404 ? "\n(Задача не найдена)" : "";
          if (window.Telegram?.WebApp) {
            window.Telegram.WebApp.showAlert(`Ошибка [PUT ${url}] (Status: ${status}): ${msg}${help}`);
          } else {
            alert(`Ошибка [PUT ${url}] (Status: ${status}): ${msg}${help}`);
          }
        })
        .finally(() => setIsSaving(false));
    } else {
      const taskToCreate = { ...taskPayload, created_at: Date.now() };
      axios.post(`/api/tasks/${telegramId}`, taskToCreate, config)
        .then(res => {
          setTasks(prev => [res.data, ...prev]);
          handleCloseModal();
        })
        .catch(err => {
          console.error("POST Task Error:", err, err.response);
          const url = err.config?.url || 'unknown url';
          const status = err.response?.status || 'No Status';
          const msg = err.response?.data?.detail || err.message || "Сервер не ответил";
          const help = (status === 422) ? "\n(Ошибка валидации. Проверьте название и другие поля.)" : 
                       (err.code === 'ECONNABORTED') ? "\n(Время ожидания истекло. Медленный интернет?)" : "";
          if (window.Telegram?.WebApp) {
            window.Telegram.WebApp.showAlert(`Ошибка [POST ${url}] (Status: ${status}): ${msg}${help}`);
          } else {
            alert(`Ошибка [POST ${url}] (Status: ${status}): ${msg}${help}`);
          }
        })
        .finally(() => setIsSaving(false));
    }
  };

  const toggleTask = (id) => {
    const task = tasks.find(t => t.id == id);
    if (!task) return;
    
    // Optimistic update - toggle locally first
    const updatedTasks = tasks.map(t => t.id == id ? { ...t, is_completed: !t.is_completed } : t);
    setTasks(updatedTasks);
    syncToLocalStorage(updatedTasks);
    
    axios.put(`/api/tasks/${id}`, { is_completed: !task.is_completed })
      .then(res => {
        setTasks(prev => prev.map(t => t.id == id ? res.data : t));
      })
      .catch(err => {
        console.error(err);
        // Keep local change even if server fails
      });
  };

  const deleteTask = (id) => {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.showConfirm("Удалить задачу?", (confirmed) => {
        if (confirmed) performDelete(id);
      });
    } else {
      if (window.confirm("Удалить задачу?")) performDelete(id);
    }
  };

  const performDelete = (id) => {
    // Optimistic delete - remove locally first
    const updatedTasks = tasks.filter(t => t.id != id);
    setTasks(updatedTasks);
    syncToLocalStorage(updatedTasks);
    
    axios.delete(`/api/tasks/${id}`)
      .catch(err => {
        console.error(err);
        // Task already removed locally, no need to block UI
      });
  };

  const filteredTasks = (Array.isArray(tasks) ? tasks : []).filter(task => {
    if (filter === 'active') return !task.is_completed;
    if (filter === 'completed') return task.is_completed;
    if (filter === 'overdue') {
      if (task.is_completed || !task.due_date) return false;
      const now = getMinskNow();
      const today = now.toISOString().split('T')[0];
      if (task.due_date < today) return true;
      if (task.due_date === today && task.due_time) {
        const nowTime = now.toTimeString().split(' ')[0].substring(0, 5); // "HH:MM"
        return task.due_time < nowTime;
      }
      return false;
    }
    return true;
  }).sort((a, b) => {
    if (sort === 'oldest') return (a.created_at || 0) - (b.created_at || 0);
    if (sort === 'priority') {
      const pMap = { high: 3, medium: 2, low: 1 };
      return (pMap[b.priority] || 0) - (pMap[a.priority] || 0);
    }
    return (b.created_at || 0) - (a.created_at || 0); // newest default
  });

  const getPriorityColor = (priority) => {
    switch(priority) {
      case 'high': return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'medium': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
      case 'low': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
      default: return 'text-gray-500 bg-gray-500/10 border-gray-500/20';
    }
  };

  const PriorityBadge = ({ priority }) => (
    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${getPriorityColor(priority)}`}>
      {priority}
    </span>
  );

  return (
    <div className="p-4 relative min-h-[calc(100vh-4rem)] bg-tg-bg">
      <div className="sticky top-0 z-10 bg-tg-bg/90 backdrop-blur-md pt-2 pb-4">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-tg-text">Ваши задачи</h1>
          <button 
            onClick={refreshTasks}
            className="p-2 bg-tg-secondaryBg text-tg-button rounded-xl border border-tg-button/10 active:scale-95 transition-all"
          >
            <PlusCircle size={20} className="rotate-45" /> 
          </button>
        </div>
        
        {/* Controls */}
        <div className="flex flex-col gap-3">
          <div className="flex bg-tg-secondaryBg p-1 rounded-xl shadow-sm overflow-x-auto">
             {['all', 'active', 'completed', 'overdue'].map(f => (
               <button 
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`flex-1 min-w-[80px] py-1.5 text-sm font-medium rounded-lg capitalize transition-colors
                    ${filter === f ? 'bg-tg-button text-tg-buttonText shadow-sm' : 'text-tg-hint'}`}
               >
                 {f === 'all' ? 'Все' : f === 'active' ? 'Активные' : f === 'completed' ? 'Готовые' : 'Просрочено'}
               </button>
             ))}
          </div>
          
          <div className="flex items-center justify-between text-sm">
             <span className="text-tg-hint flex items-center gap-1"><span className="font-semibold">{filteredTasks.length}</span> задач</span>
             <select 
               value={sort} 
               onChange={(e) => setSort(e.target.value)}
               className="bg-transparent text-tg-button font-medium border-none outline-none focus:ring-0 text-right appearance-none custom-select"
             >
               <option value="newest" className="text-black">Сначала новые</option>
               <option value="oldest" className="text-black">Сначала старые</option>
               <option value="priority" className="text-black">По приоритету</option>
             </select>
          </div>
        </div>
      </div>
      
      <div className="space-y-3 pb-24 mt-2">
        {filteredTasks.map(task => (
             <div key={task.id} className={`flex flex-col gap-2 p-4 bg-tg-secondaryBg rounded-2xl shadow-sm transition-opacity ${task.is_completed ? 'opacity-60' : 'opacity-100'}`}>
                <div className="flex items-start gap-4">
                  <button 
                    onClick={(e) => { e.stopPropagation(); toggleTask(task.id); }} 
                    className="text-tg-button mt-0.5 flex-shrink-0 p-1 -m-1"
                  >
                    {task.is_completed ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                  </button>
                  <div className="flex-1 min-w-0" onClick={() => handleOpenModal(task)}>
                    <h3 className={`text-base font-semibold truncate transition-all ${task.is_completed ? 'line-through text-tg-hint' : 'text-tg-text'}`}>
                      {task.title}
                    </h3>
                    {task.description && (
                      <p className="text-sm text-tg-hint mt-1 line-clamp-2 leading-snug">{task.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <PriorityBadge priority={task.priority} />
                      {task.due_date && (
                        <div className="flex items-center gap-1 text-[11px] text-tg-hint bg-tg-bg px-2 py-0.5 rounded-md border border-tg-hint/20">
                          <Calendar size={12} /> {task.due_date}{task.due_time ? ` ${task.due_time}` : ''}
                        </div>
                      )}
                      {task.linkedEventId && (
                        <div className="flex items-center gap-1 text-[11px] text-tg-button bg-tg-button/10 px-2 py-0.5 rounded-md border border-tg-button/20">
                          <CheckCircle2 size={12} /> Связано с парой
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0 items-center justify-start h-full">
                     <button onClick={(e) => { e.stopPropagation(); handleOpenModal(task); }} className="text-tg-hint hover:text-tg-button p-1">
                        <Edit2 size={16} />
                     </button>
                     <button onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }} className="text-tg-hint hover:text-red-500 p-1">
                        <Trash2 size={16} />
                     </button>
                  </div>
                </div>
             </div>
        ))}
        {tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center text-tg-hint py-12 px-4 text-center">
            <div className="w-16 h-16 mb-4 rounded-full bg-tg-secondaryBg flex items-center justify-center">
               <Check size={32} className="text-tg-button/50" />
            </div>
            <p className="font-medium text-lg text-tg-text">Всё выполнено!</p>
            <p className="text-sm mt-1">Создайте новую задачу, чтобы составить план.</p>
          </div>
        )}
      </div>

      {/* Floating Add Area */}
      <div className="fixed bottom-[80px] right-5 z-20">
        <button 
          onClick={() => handleOpenModal()}
          className="bg-tg-button text-tg-buttonText w-14 h-14 rounded-full shadow-xl flex items-center justify-center hover:scale-105 transition-transform"
        >
          <PlusCircle size={28} />
        </button>
      </div>

      {/* Bottom Sheet Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-0">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={handleCloseModal} />
          <div className="relative bg-tg-secondaryBg w-full sm:w-[400px] sm:rounded-2xl rounded-t-2xl shadow-2xl transition-transform max-h-[85vh] flex flex-col transform translate-y-0 mb-[70px]">
            <div className="flex items-center justify-between p-5 pb-2">
              <h2 className="text-xl font-bold text-tg-text">{currentTask.id ? 'Редактировать' : 'Новая Задача'}</h2>
              <button type="button" onClick={handleCloseModal} className="text-tg-hint hover:text-tg-text bg-tg-bg p-1.5 rounded-full"><X size={20} /></button>
            </div>
            
            <form onSubmit={(e) => { e.preventDefault(); !isSaving && handleSaveTask(); }} className="flex flex-col flex-1 overflow-hidden">
            <div ref={modalContentRef} className="overflow-y-auto overflow-x-hidden px-5 flex-1 scroll-smooth">
            <div className="space-y-4 pt-2">
              <div>
                 <label className="block text-xs font-semibold uppercase text-tg-hint mb-1">Название</label>
                 <input 
                   type="text"
                   value={currentTask.title}
                   onChange={(e) => setCurrentTask({...currentTask, title: e.target.value})}
                   placeholder="Название задачи..."
                   className="w-full px-4 h-[48px] rounded-xl bg-tg-bg text-tg-text focus:outline-none focus:ring-2 focus:ring-tg-button border border-tg-hint/20 focus:border-tg-button shadow-inner font-semibold appearance-none transition-all"
                   autoFocus
                 />
              </div>
              
              <div>
                 <label className="block text-xs font-semibold uppercase text-tg-hint mb-1">Описание</label>
                 <textarea 
                   value={currentTask.description}
                   onChange={(e) => setCurrentTask({...currentTask, description: e.target.value})}
                   placeholder="Дополнительные детали..."
                   className="w-full px-4 py-3 rounded-xl bg-tg-bg text-tg-text focus:outline-none focus:ring-2 focus:ring-tg-button border border-tg-hint/20 focus:border-tg-button shadow-inner resize-none h-24 text-sm transition-all"
                 />
              </div>

              <div className="grid grid-cols-2 gap-3">
                 <div>
                    <label className="block text-xs font-semibold uppercase text-tg-hint mb-1">Приоритет</label>
                    <select 
                      value={currentTask.priority}
                      onChange={(e) => setCurrentTask({...currentTask, priority: e.target.value})}
                   className="w-full px-3 py-2.5 rounded-xl bg-tg-bg text-tg-text focus:outline-none focus:ring-2 focus:ring-tg-button border border-tg-hint/20 focus:border-tg-button custom-select text-sm transition-all"
                    >
                      <option value="low" className="text-black">Низкий</option>
                      <option value="medium" className="text-black">Средний</option>
                      <option value="high" className="text-black">Высокий</option>
                    </select>
                 </div>
                 <div>
                    <label className="block text-xs font-semibold uppercase text-tg-hint mb-1 flex items-center gap-1"><Calendar size={12}/> Дедлайн</label>
                    <SegmentedDateInput
                      value={currentTask.due_date || ''}
                      onChange={(v) => setCurrentTask(prev => ({...prev, due_date: v}))}
                    />
                  </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-tg-hint mb-1 flex items-center gap-1"><Clock size={12}/> Время дедлайна</label>
                <input
                  type="time"
                  value={currentTask.due_time || ''}
                  onChange={(e) => setCurrentTask({...currentTask, due_time: e.target.value})}
                   className="w-full px-3 py-2.5 rounded-xl bg-tg-bg text-tg-text focus:outline-none focus:ring-2 focus:ring-tg-button border border-tg-hint/20 focus:border-tg-button min-h-[44px] transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-tg-hint mb-1">Привязать к паре ({currentTask.due_date || 'Сегодня'})</label>
                <select 
                  value={currentTask.linkedEventId || ''}
                  onChange={(e) => setCurrentTask({...currentTask, linkedEventId: e.target.value || null})}
                  className="w-full px-3 py-2.5 rounded-xl bg-tg-bg text-tg-text focus:outline-none focus:ring-2 focus:ring-tg-button border border-transparent custom-select text-sm"
                >
                  <option value="">Не привязано</option>
                  {scheduleEvents.map((event, i) => {
                    const datePart = currentTask.due_date || getMinskNow().toISOString().split('T')[0];
                    const id = `${datePart}_${event.startLessonTime}_${event.subject}`;
                    return (
                      <option key={i} value={id}>
                        {event.startLessonTime} - {event.subject}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Reminders section */}
              <div>
                <label className="block text-xs font-semibold uppercase text-tg-hint mb-2 ml-1 flex items-center gap-1.5">
                  <Bell size={12} /> Напомнить за
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 5, label: '5 мин' },
                    { value: 15, label: '15 мин' },
                    { value: 30, label: '30 мин' },
                    { value: 60, label: '1 час' },
                    { value: 120, label: '2 часа' },
                    { value: 1440, label: '1 день' },
                  ].map(r => {
                    const isActive = (currentTask.reminders || []).includes(r.value);
                    return (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => {
                          setCurrentTask(prev => ({
                            ...prev,
                            reminders: isActive
                              ? (prev.reminders || []).filter(v => v !== r.value)
                              : [...(prev.reminders || []), r.value].sort((a, b) => a - b)
                          }));
                        }}
                        className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all border-2 ${
                          isActive
                            ? 'bg-tg-button text-tg-buttonText border-tg-button shadow-md'
                            : 'bg-tg-bg text-tg-hint border-transparent'
                        }`}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
                {(currentTask.reminders || []).length > 0 && (
                  <div className="mt-2 text-[10px] text-tg-hint font-medium ml-1">
                    Выбрано: {(currentTask.reminders || []).map(r => {
                      if (r >= 1440) return `${r / 1440} д`;
                      if (r >= 60) return `${r / 60} ч`;
                      return `${r} мин`;
                    }).join(', ')}
                  </div>
                )}
              </div>

            </div>
            </div>
            <div className="px-5 py-4 border-t border-[var(--tg-theme-hint-color)] border-opacity-10">
              <button 
                type="submit"
                disabled={isSaving}
                onClick={(e) => { 
                  // Fallback for mobile devices where form onSubmit might be flaky
                  if (!isSaving && e.target.type === 'submit') {
                    // button will trigger form submit, but we can also call it here if needed
                    // however, let's just ensure the button is clickable
                  }
                }}
                className="w-full py-3.5 bg-tg-button text-tg-buttonText font-bold rounded-xl active:scale-[0.98] transition-transform shadow-lg shadow-tg-button/20 flex items-center justify-center gap-2 disabled:opacity-70 disabled:active:scale-100"
              >
                {isSaving ? (
                  <>
                    <div className="w-5 h-5 border-2 border-tg-buttonText/20 border-t-tg-buttonText rounded-full animate-spin"></div>
                    Загрузка...
                  </>
                ) : (
                  currentTask.id ? 'Сохранить изменения' : 'Добавить задачу'
                )}
              </button>
            </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
