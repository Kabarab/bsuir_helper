import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Circle, CheckCircle2, Calendar, Edit2, Trash2, PlusCircle, X, Check } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { getMinskNow } from '../utils/minskTime';

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
  const [filter, setFilter] = useState('all'); // all, active, completed
  const [sort, setSort] = useState('newest'); // newest, oldest, priority
  
  // Schedule integration
  const [scheduleEvents, setScheduleEvents] = useState([]);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentTask, setCurrentTask] = useState({ id: null, title: '', description: '', priority: 'medium', dueDate: '', linkedEventId: null });

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
    localStorage.setItem('bsuir_tasks', JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    if (!telegramId) return;
    
    axios.get(`/api/tasks/${telegramId}`)
      .then(res => {
        setTasks(Array.isArray(res.data) ? res.data : []);
      })
      .catch(console.error);

    fetchEventsForDate(getMinskNow().toISOString().split('T')[0]);
  }, [telegramId, group]);

  useEffect(() => {
    if (currentTask.dueDate) {
      fetchEventsForDate(currentTask.dueDate);
    }
  }, [currentTask.dueDate]);

  const handleOpenModal = (task = null) => {
    if (task) {
      setCurrentTask(task);
    } else {
      setCurrentTask({ id: null, title: '', description: '', priority: 'medium', dueDate: '', linkedEventId: null });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleSaveTask = () => {
    if (!currentTask.title.trim()) return;
    
    if (currentTask.id) {
      axios.put(`/api/tasks/${currentTask.id}`, currentTask)
        .then(res => setTasks(tasks.map(t => t.id === currentTask.id ? res.data : t)))
        .catch(console.error);
    } else {
      const taskToCreate = { ...currentTask, created_at: Date.now() };
      axios.post(`/api/tasks/${telegramId}`, taskToCreate)
        .then(res => setTasks([res.data, ...tasks]))
        .catch(console.error);
    }
    handleCloseModal();
  };

  const toggleTask = (id) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    
    axios.put(`/api/tasks/${id}`, { is_completed: !task.is_completed })
      .then(res => setTasks(tasks.map(t => t.id === id ? res.data : t)))
      .catch(console.error);
  };

  const deleteTask = (id) => {
    axios.delete(`/api/tasks/${id}`)
      .then(() => setTasks(tasks.filter(t => t.id !== id)))
      .catch(console.error);
  };

  const filteredTasks = (Array.isArray(tasks) ? tasks : []).filter(task => {
    if (filter === 'active') return !task.is_completed;
    if (filter === 'completed') return task.is_completed;
    return true;
  }).sort((a, b) => {
    if (sort === 'oldest') return (a.created_at || a.createdAt || 0) - (b.created_at || b.createdAt || 0);
    if (sort === 'priority') {
      const pMap = { high: 3, medium: 2, low: 1 };
      return (pMap[b.priority] || 0) - (pMap[a.priority] || 0);
    }
    return (b.created_at || b.createdAt || 0) - (a.created_at || a.createdAt || 0); // newest default
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
        <h1 className="text-2xl font-bold mb-4 text-tg-text">Ваши задачи</h1>
        
        {/* Controls */}
        <div className="flex flex-col gap-3">
          <div className="flex bg-tg-secondaryBg p-1 rounded-xl shadow-sm overflow-x-auto">
             {['all', 'active', 'completed'].map(f => (
               <button 
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`flex-1 min-w-[80px] py-1.5 text-sm font-medium rounded-lg capitalize transition-colors
                    ${filter === f ? 'bg-tg-button text-tg-buttonText shadow-sm' : 'text-tg-hint'}`}
               >
                 {f === 'all' ? 'Все' : f === 'active' ? 'Активные' : 'Готовые'}
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
                <div className="flex items-start gap-3">
                  <button onClick={() => toggleTask(task.id)} className="text-tg-button mt-0.5 flex-shrink-0">
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
                      {task.dueDate && (
                        <div className="flex items-center gap-1 text-[11px] text-tg-hint bg-tg-bg px-2 py-0.5 rounded-md border border-tg-hint/20">
                          <Calendar size={12} /> {task.dueDate}
                        </div>
                      )}
                      {task.linkedEventId && (
                        <div className="flex items-center gap-1 text-[11px] text-tg-button bg-tg-button/10 px-2 py-0.5 rounded-md border border-tg-button/20">
                          <CheckCircle2 size={12} /> Связано с парой
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0 items-center justify-center h-full">
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
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-0">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={handleCloseModal} />
          <div className="relative bg-tg-secondaryBg w-full sm:w-[400px] sm:rounded-2xl rounded-t-2xl shadow-2xl transition-transform max-h-[85vh] flex flex-col transform translate-y-0 mb-[70px]">
            <div className="flex items-center justify-between p-5 pb-2">
              <h2 className="text-xl font-bold text-tg-text">{currentTask.id ? 'Редактировать' : 'Новая Задача'}</h2>
              <button type="button" onClick={handleCloseModal} className="text-tg-hint hover:text-tg-text bg-tg-bg p-1.5 rounded-full"><X size={20} /></button>
            </div>
            
            <form onSubmit={(e) => { e.preventDefault(); handleSaveTask(); }} className="flex flex-col flex-1 overflow-hidden">
            <div className="overflow-y-auto overflow-x-hidden px-5 flex-1">
            <div className="space-y-4">
              <div>
                 <label className="block text-xs font-semibold uppercase text-tg-hint mb-1">Название</label>
                 <input 
                   type="text"
                   value={currentTask.title}
                   onChange={(e) => setCurrentTask({...currentTask, title: e.target.value})}
                   placeholder="Что нужно сделать?"
                   className="w-full px-4 h-[48px] rounded-xl bg-tg-bg text-tg-text focus:outline-none focus:ring-2 focus:ring-tg-button border border-transparent shadow-inner font-medium appearance-none"
                   autoFocus
                 />
              </div>
              
              <div>
                 <label className="block text-xs font-semibold uppercase text-tg-hint mb-1">Описание</label>
                 <textarea 
                   value={currentTask.description}
                   onChange={(e) => setCurrentTask({...currentTask, description: e.target.value})}
                   placeholder="Дополнительные детали..."
                   className="w-full px-4 py-3 rounded-xl bg-tg-bg text-tg-text focus:outline-none focus:ring-2 focus:ring-tg-button border border-transparent shadow-inner resize-none h-24 text-sm"
                 />
              </div>

              <div className="grid grid-cols-2 gap-3">
                 <div>
                    <label className="block text-xs font-semibold uppercase text-tg-hint mb-1">Приоритет</label>
                    <select 
                      value={currentTask.priority}
                      onChange={(e) => setCurrentTask({...currentTask, priority: e.target.value})}
                      className="w-full px-3 py-2.5 rounded-xl bg-tg-bg text-tg-text focus:outline-none focus:ring-2 focus:ring-tg-button border border-transparent custom-select"
                    >
                      <option value="low" className="text-black">Низкий</option>
                      <option value="medium" className="text-black">Средний</option>
                      <option value="high" className="text-black">Высокий</option>
                    </select>
                 </div>
                 <div>
                    <label className="block text-xs font-semibold uppercase text-tg-hint mb-1 flex items-center gap-1"><Calendar size={12}/> Дедлайн</label>
                    <input 
                      type="date"
                      value={currentTask.dueDate}
                      onChange={(e) => setCurrentTask({...currentTask, dueDate: e.target.value})}
                      className="w-full px-3 py-2.5 rounded-xl bg-tg-bg text-tg-text focus:outline-none focus:ring-2 focus:ring-tg-button border border-transparent min-h-[44px]"
                    />
                  </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-tg-hint mb-1">Привязать к паре ({currentTask.dueDate || 'Сегодня'})</label>
                <select 
                  value={currentTask.linkedEventId || ''}
                  onChange={(e) => setCurrentTask({...currentTask, linkedEventId: e.target.value || null})}
                  className="w-full px-3 py-2.5 rounded-xl bg-tg-bg text-tg-text focus:outline-none focus:ring-2 focus:ring-tg-button border border-transparent custom-select text-sm"
                >
                  <option value="">Не привязано</option>
                  {scheduleEvents.map((event, i) => {
                    const datePart = currentTask.dueDate || getMinskNow().toISOString().split('T')[0];
                    const id = `${datePart}_${event.startLessonTime}_${event.subject}`;
                    return (
                      <option key={i} value={id}>
                        {event.startLessonTime} - {event.subject}
                      </option>
                    );
                  })}
                </select>
              </div>

            </div>
            </div>
            <div className="px-5 py-4 border-t border-[var(--tg-theme-hint-color)] border-opacity-10">
              <button 
                type="submit"
                className="w-full py-3.5 bg-tg-button text-tg-buttonText font-bold rounded-xl active:scale-[0.98] transition-transform shadow-lg shadow-tg-button/20"
              >
                {currentTask.id ? 'Сохранить изменения' : 'Добавить задачу'}
              </button>
            </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
