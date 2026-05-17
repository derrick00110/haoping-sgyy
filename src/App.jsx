import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, AlertTriangle, User, ShieldCheck, Calculator, Image as ImageIcon, Lock, LogOut } from 'lucide-react';
import { db } from './firebase';
import { 
  collection, query, orderBy, onSnapshot, 
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp 
} from 'firebase/firestore';

export default function App() {
  const [role, setRole] = useState('teacher');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

  // Firebase 数据（初始为空，onSnapshot 加载）
  const [teacherList, setTeacherList] = useState([]); // [{ id, name }, ...]
  const [reviews, setReviews] = useState([]);
  const [dataReady, setDataReady] = useState(false);
  const teachers = teacherList.map(t => t.name);

  const [currentTeacher, setCurrentTeacher] = useState('');
  const [activeTab, setActiveTab] = useState('submit');

  // 表单状态
  const [orderNo, setOrderNo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // 图片上传状态
  const [previewImage, setPreviewImage] = useState(null);
  
  // 老师管理状态
  const [showTeacherMgmt, setShowTeacherMgmt] = useState(false);
  const [newTeacherName, setNewTeacherName] = useState('');

  const ADMIN_PASSWORD = 'sgyyzhou';

  // --- Firebase 实时监听 ---
  useEffect(() => {
    // 监听 teachers 集合
    const unsubTeachers = onSnapshot(collection(db, 'teachers'), (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setTeacherList(list);
    });

    // 监听 reviews 集合（按创建时间倒序）
    const q = query(collection(db, 'reviews'), orderBy('createdAt', 'desc'));
    const unsubReviews = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setReviews(list);
    });

    // 等待初始数据加载完成
    const timer = setTimeout(() => setDataReady(true), 1000);

    return () => {
      unsubTeachers();
      unsubReviews();
      clearTimeout(timer);
    };
  }, []);

  // teachers 加载完成后，设置默认 currentTeacher
  useEffect(() => {
    if (teachers.length > 0 && !currentTeacher) {
      setCurrentTeacher(teachers[0]);
    }
  }, [teachers.length]);

  // --- 店长登录逻辑 ---
  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (adminPasswordInput === ADMIN_PASSWORD) {
      setIsAdminAuthenticated(true);
      setRole('admin');
      setActiveTab('list');
      setAuthError('');
      setAdminPasswordInput('');
    } else {
      setAuthError('密码错误，请重新输入');
    }
  };

  const handleLogout = () => {
    setIsAdminAuthenticated(false);
    setRole('teacher');
    setActiveTab('submit');
  };

  const attemptRoleSwitch = (newRole) => {
    if (newRole === 'admin') {
      if (!isAdminAuthenticated) {
        setRole('login'); 
      } else {
        setRole('admin');
        setActiveTab('list');
      }
    } else {
      setRole('teacher');
      setActiveTab('submit');
    }
  };

  // --- 图片处理（客户端压缩 + 预览） ---
  const compressImage = (dataUrl) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        const MAX_SIZE = 1200;
        if (width > MAX_SIZE || height > MAX_SIZE) {
          if (width > height) {
            height = Math.round((height / width) * MAX_SIZE);
            width = MAX_SIZE;
          } else {
            width = Math.round((width / height) * MAX_SIZE);
            height = MAX_SIZE;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = dataUrl;
    });
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setErrorMsg('请上传图片格式的文件');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImage(reader.result);
        setErrorMsg('');
      };
      reader.readAsDataURL(file);
    }
  };

  // --- 提交好评（Firebase 版本） ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!orderNo.trim()) {
      setErrorMsg('必须填写美团订单号或券码！');
      return;
    }
    
    if (!previewImage) {
      setErrorMsg('请上传带有日期的好评截图！');
      return;
    }

    // 查重
    const isDuplicate = reviews.some(r => r.orderNo === orderNo.trim());
    if (isDuplicate) {
      setErrorMsg(`查重失败：订单号 ${orderNo} 已经被使用过！请勿重复提交或拿旧图忽悠。`);
      return;
    }

    setSubmitting(true);
    try {
      // 1. 在客户端压缩图片
      const compressedImage = await compressImage(previewImage);

      // 2. 保存到 Firestore（图片以 base64 字符串形式存储）
      await addDoc(collection(db, 'reviews'), {
        teacher: currentTeacher,
        orderNo: orderNo.trim(),
        date: date,
        status: 'pending',
        imageUrl: compressedImage,
        createdAt: serverTimestamp(),
      });

      setSuccessMsg('提交成功！等待店长核对美团后台后生效。');
      setOrderNo('');
      setDate(new Date().toISOString().split('T')[0]);
      setPreviewImage(null);
      // 重置文件输入
      document.getElementById('camera-input') && (document.getElementById('camera-input').value = '');
      document.getElementById('album-input') && (document.getElementById('album-input').value = '');
    } catch (err) {
      setErrorMsg('提交失败：' + err.message);
    }
    setSubmitting(false);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // --- 店长审核 ---
  const handleReviewAction = async (id, action) => {
    try {
      await updateDoc(doc(db, 'reviews', id), { status: action });
    } catch (err) {
      alert('操作失败：' + err.message);
    }
  };

  // --- 老师管理 ---
  const handleAddTeacher = async () => {
    const name = newTeacherName.trim();
    if (!name) return;
    if (teachers.includes(name)) {
      alert('该老师已存在！');
      return;
    }
    try {
      await addDoc(collection(db, 'teachers'), { 
        name, 
        createdAt: serverTimestamp() 
      });
      setNewTeacherName('');
    } catch (err) {
      alert('添加失败：' + err.message);
    }
  };

  const handleRemoveTeacher = async (name) => {
    if (!window.confirm(`确定要删除「${name}」吗？（该老师的好评记录不会删除）`)) return;
    try {
      const target = teacherList.find(t => t.name === name);
      if (target) {
        await deleteDoc(doc(db, 'teachers', target.id));
      }
      if (currentTeacher === name) {
        setCurrentTeacher(teachers.filter(t => t !== name)[0] || '');
      }
    } catch (err) {
      alert('删除失败：' + err.message);
    }
  };

  // --- 日期辅助函数 ---
  const getWeekRange = () => {
    const now = new Date();
    const day = now.getDay(); // 0=周日, 1=周一...
    const diff = day === 0 ? -6 : 1 - day; // 回到本周一
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday };
  };
  const getMonthRange = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    firstDay.setHours(0, 0, 0, 0);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    lastDay.setHours(23, 59, 59, 999);
    return { start: firstDay, end: lastDay };
  };

  // --- 奖惩计算（按自然周/自然月） ---
  const calculateStats = (teacherName) => {
    const teacherReviews = reviews.filter(r => r.teacher === teacherName && r.status === 'approved');
    const totalCount = teacherReviews.length;

    const weekRange = getWeekRange();
    const monthRange = getMonthRange();

    const weekCount = teacherReviews.filter(r => {
      const d = new Date(r.date + 'T00:00:00');
      return d >= weekRange.start && d <= weekRange.end;
    }).length;

    const monthCount = teacherReviews.filter(r => {
      const d = new Date(r.date + 'T00:00:00');
      return d >= monthRange.start && d <= monthRange.end;
    }).length;

    let weeklyPenalty = 0;
    let weeklyBonus = 0;
    if (weekCount < 10) {
      weeklyPenalty = (10 - weekCount) * 5;
    } else if (weekCount > 20) {
      weeklyBonus = (weekCount - 20) * 5;
    }

    let monthlyPenalty = 0;
    let monthlyBonus = 0;
    if (monthCount < 60) {
      monthlyPenalty = (60 - monthCount) * 5;
    } else if (monthCount > 90) {
      monthlyBonus = (monthCount - 90) * 5;
    }

    return { totalCount, weekCount, monthCount, weeklyPenalty, weeklyBonus, monthlyPenalty, monthlyBonus };
  };

  // --- 首次加载等待 ---
  if (!dataReady) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 text-gray-800 font-sans pb-10">
      {/* 顶部导航 */}
      <header className="bg-blue-600 text-white p-4 shadow-md flex justify-between items-center sticky top-0 z-10">
        <h1 className="text-xl font-bold flex items-center truncate">
          <ShieldCheck className="mr-2 flex-shrink-0"/> 
          好评管理系统
        </h1>
        <div className="flex space-x-2">
          {isAdminAuthenticated && role === 'admin' ? (
            <button 
              onClick={handleLogout} 
              className="flex items-center px-3 py-1 rounded-full text-sm bg-red-500 hover:bg-red-600 text-white"
            >
              <LogOut size={14} className="mr-1"/> 退出店长
            </button>
          ) : (
            <>
              <button 
                onClick={() => attemptRoleSwitch('teacher')} 
                className={`px-3 py-1 rounded-full text-sm ${role === 'teacher' ? 'bg-white text-blue-600 font-bold' : 'bg-blue-500'}`}
              >
                老师端
              </button>
              <button 
                onClick={() => attemptRoleSwitch('admin')} 
                className={`px-3 py-1 rounded-full text-sm ${role === 'admin' || role === 'login' ? 'bg-white text-blue-600 font-bold' : 'bg-blue-500'}`}
              >
                店长端
              </button>
            </>
          )}
        </div>
      </header>

      <main className="max-w-md mx-auto mt-4 p-4">
        
        {/* 登录界面 */}
        {role === 'login' && (
          <div className="bg-white p-6 rounded-lg shadow-md mt-10 border-t-4 border-blue-600">
            <div className="text-center mb-6">
              <div className="bg-blue-100 p-3 rounded-full inline-block mb-2">
                <Lock className="text-blue-600" size={32} />
              </div>
              <h2 className="text-xl font-bold text-gray-800">店长身份验证</h2>
              <p className="text-sm text-gray-500 mt-1">请输入授权密码以访问管理后台</p>
            </div>
            
            <form onSubmit={handleAdminLogin}>
              <div className="mb-4">
                <input 
                  type="password" 
                  value={adminPasswordInput}
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                  placeholder="请输入店长密码" 
                  className="w-full p-3 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              {authError && <div className="text-red-500 text-sm mb-4 text-center">{authError}</div>}
              <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition">
                验证并进入
              </button>
            </form>
          </div>
        )}

        {/* 主界面 */}
        {role !== 'login' && (
          <>
            {/* 导航标签 */}
            <div className="flex bg-white rounded-lg shadow mb-6 overflow-hidden">
              {role === 'teacher' && (
                <button onClick={() => setActiveTab('submit')} className={`flex-1 py-3 text-center font-medium ${activeTab === 'submit' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>
                  上传好评
                </button>
              )}
              <button onClick={() => setActiveTab('list')} className={`flex-1 py-3 text-center font-medium ${activeTab === 'list' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>
                {role === 'admin' ? '审核列表' : '我的记录'}
              </button>
              <button onClick={() => setActiveTab('stats')} className={`flex-1 py-3 text-center font-medium ${activeTab === 'stats' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}>
                奖惩统计
              </button>
            </div>

            {/* 标签页 1: 提交表单 */}
            {activeTab === 'submit' && role === 'teacher' && (
              <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="mb-4 flex items-center justify-between border-b pb-4">
                  <span className="text-gray-600">当前老师:</span>
                  <select 
                    value={currentTeacher} 
                    onChange={(e) => setCurrentTeacher(e.target.value)}
                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg p-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {teachers.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">好评日期</label>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full p-3 border rounded-lg bg-gray-50" required />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                      美团订单号/券码 <span className="text-red-500 ml-1">*</span>
                    </label>
                    <input 
                      type="text" 
                      value={orderNo} 
                      onChange={(e) => setOrderNo(e.target.value)} 
                      placeholder="输入唯一订单号用于系统查重" 
                      className="w-full p-3 border rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">提交前请核对，相同订单号无法重复提交。</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">好评截图 <span className="text-red-500 ml-1">*</span></label>

                    {/* 自定义上传区域 */}
                    {previewImage ? (
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-2 text-center bg-gray-50 relative overflow-hidden">
                        <img src={previewImage} alt="Preview" className="w-full h-auto max-h-48 object-contain rounded" />
                        <div className="mt-2 flex space-x-2">
                          <label className="flex-1 text-xs py-2 bg-gray-100 rounded hover:bg-gray-200 cursor-pointer text-center">
                            📷 重新拍照
                            <input type="file" id="camera-input" accept="image/*" capture="environment" onChange={handleImageChange} style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', opacity: 0 }} />
                          </label>
                          <label className="flex-1 text-xs py-2 bg-gray-100 rounded hover:bg-gray-200 cursor-pointer text-center">
                            🖼 从相册重选
                            <input type="file" id="album-input" accept="image/*" onChange={handleImageChange} style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', opacity: 0 }} />
                          </label>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <label className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center bg-gray-50 hover:bg-gray-100 cursor-pointer flex flex-col items-center justify-center min-h-[120px]">
                          <input type="file" id="camera-input" accept="image/*" capture="environment" onChange={handleImageChange} style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', opacity: 0 }} />
                          <ImageIcon className="mx-auto text-blue-400 mb-2" size={32} />
                          <span className="text-sm text-gray-600 font-medium">📷 拍照</span>
                          <span className="text-xs text-gray-400 mt-1">使用相机</span>
                        </label>
                        <label className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center bg-gray-50 hover:bg-gray-100 cursor-pointer flex flex-col items-center justify-center min-h-[120px]">
                          <input type="file" id="album-input" accept="image/*" onChange={handleImageChange} style={{ position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', opacity: 0 }} />
                          <ImageIcon className="mx-auto text-green-400 mb-2" size={32} />
                          <span className="text-sm text-gray-600 font-medium">🖼 从相册选择</span>
                          <span className="text-xs text-gray-400 mt-1">选择已有图片</span>
                        </label>
                      </div>
                    )}
                  </div>

                  {errorMsg && <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm flex items-start"><AlertTriangle className="mr-2 flex-shrink-0 mt-0.5" size={16} /> {errorMsg}</div>}
                  {successMsg && <div className="p-3 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm flex items-start"><CheckCircle className="mr-2 flex-shrink-0 mt-0.5" size={16} /> {successMsg}</div>}

                  <button 
                    type="submit" 
                    disabled={submitting}
                    className={`w-full text-white font-bold py-3 rounded-lg transition shadow-lg mt-4 ${submitting ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                  >
                    {submitting ? '上传中...' : '提交好评审核'}
                  </button>
                </form>
              </div>
            )}

            {/* 标签页 2: 记录/审核列表 */}
            {activeTab === 'list' && (
              <div className="space-y-4">
                {/* 店长端：老师管理 */}
                {role === 'admin' && (
                  <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
                    <button
                      onClick={() => setShowTeacherMgmt(!showTeacherMgmt)}
                      className="w-full text-left flex items-center justify-between text-sm font-medium text-gray-700"
                    >
                      <div className="flex items-center">
                        <User className="mr-2 text-blue-500" size={18} />
                        <span>管理老师 ({teachers.length}位)</span>
                      </div>
                      <span className="text-gray-400">{showTeacherMgmt ? '收起 ▲' : '展开 ▼'}</span>
                    </button>
                    
                    {showTeacherMgmt && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <div className="flex flex-wrap gap-2 mb-3">
                          {teachers.map(t => (
                            <span key={t} className="inline-flex items-center px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm">
                              {t}
                              {teachers.length > 1 && (
                                <button
                                  onClick={() => handleRemoveTeacher(t)}
                                  className="ml-2 text-red-400 hover:text-red-600"
                                  title="删除"
                                >×</button>
                              )}
                            </span>
                          ))}
                        </div>
                        <div className="flex space-x-2">
                          <input
                            type="text"
                            value={newTeacherName}
                            onChange={(e) => setNewTeacherName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddTeacher()}
                            placeholder="输入新老师姓名（如：赵老师）"
                            className="flex-1 p-2 border rounded text-sm bg-gray-50 focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            type="button"
                            onClick={handleAddTeacher}
                            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 whitespace-nowrap"
                          >
                            ＋ 添加
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 好评列表 */}
                {reviews.filter(r => role === 'admin' ? true : r.teacher === currentTeacher).map(review => (
                  <div key={review.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex flex-col">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <span className="font-bold text-lg mr-2">{review.teacher}</span>
                        <span className="text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{review.date}</span>
                      </div>
                      {review.status === 'pending' && <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full flex items-center font-medium"><Clock size={12} className="mr-1"/> 待查验</span>}
                      {review.status === 'approved' && <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full flex items-center font-medium"><CheckCircle size={12} className="mr-1"/> 已通过</span>}
                      {review.status === 'rejected' && <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full flex items-center font-medium"><XCircle size={12} className="mr-1"/> 驳回</span>}
                    </div>
                    
                    <div className="flex gap-3 mb-2">
                       {/* 图片：Firebase URL 直接显示 */}
                       {review.imageUrl && (
                         <div className="w-20 h-20 flex-shrink-0 bg-gray-100 rounded overflow-hidden border">
                           <img src={review.imageUrl} alt="好评截图" className="w-full h-full object-cover" />
                         </div>
                       )}
                       <div className="flex-1 text-sm text-gray-700 bg-blue-50 p-2 rounded border border-blue-100">
                        <p className="mb-1 text-xs text-gray-500">订单号/券码:</p>
                        <p className="font-mono font-bold text-base text-gray-800 break-all">{review.orderNo}</p>
                      </div>
                    </div>
                    
                    {role === 'admin' && review.status === 'pending' && (
                      <div className="flex space-x-3 border-t border-gray-100 pt-3 mt-2">
                        <button onClick={() => handleReviewAction(review.id, 'approved')} className="flex-1 bg-white border border-green-500 text-green-600 py-2 rounded-lg text-sm font-bold hover:bg-green-50 transition">
                          ✅ 比对一致 (通过)
                        </button>
                        <button onClick={() => handleReviewAction(review.id, 'rejected')} className="flex-1 bg-white border border-red-500 text-red-600 py-2 rounded-lg text-sm font-bold hover:bg-red-50 transition">
                          ❌ 乱填/无图 (驳回)
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {reviews.length === 0 && (
                  <div className="text-center bg-white p-10 rounded-lg shadow-sm border border-gray-100 text-gray-500">
                    <ImageIcon className="mx-auto text-gray-300 mb-2" size={48} />
                    <p>暂无好评记录</p>
                  </div>
                )}
              </div>
            )}

            {/* 标签页 3: 奖惩统计 */}
            {activeTab === 'stats' && (
              <div className="space-y-4">
                 <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-4 rounded-lg text-sm text-blue-900 shadow-sm">
                    <div className="flex items-center font-bold mb-2">
                      <Calculator className="mr-2 text-blue-600" size={18} />
                      奖惩规则说明
                    </div>
                    <ul className="list-disc pl-5 space-y-1 text-xs text-gray-700">
                      <li><span className="font-semibold">周结：</span>低于10条(罚5元/条)，高于20条(奖5元/条)</li>
                      <li><span className="font-semibold">月结：</span>低于60条(罚5元/条)，高于90条(奖5元/条)</li>
                      <li className="text-red-500">注：仅计算店长核对"已通过"的数量。</li>
                    </ul>
                 </div>

                {(role === 'admin' ? teachers : [currentTeacher]).map(teacher => {
                  const stats = calculateStats(teacher);
                  return (
                    <div key={teacher} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 border-l-4 border-l-blue-500 relative overflow-hidden">
                      <h3 className="font-bold text-lg border-b border-gray-100 pb-2 mb-4 flex items-center text-gray-800">
                        <User className="mr-2 text-blue-500 bg-blue-50 p-1 rounded-full" size={24}/> 
                        {teacher}
                      </h3>
                      
                      <div className="bg-gray-50 p-4 rounded-lg mb-4">
                        <div className="text-center mb-3">
                          <p className="text-sm text-gray-500 font-medium mb-1">累计有效好评</p>
                          <p className="text-4xl font-black text-gray-800 tracking-tight">
                            {stats.totalCount} <span className="text-base font-normal text-gray-500">条</span>
                          </p>
                        </div>
                        <div className="flex justify-around text-xs text-gray-500 border-t pt-2">
                          <span>本周已通过: <strong>{stats.weekCount}</strong> 条</span>
                          <span>本月已通过: <strong>{stats.monthCount}</strong> 条</span>
                        </div>
                      </div>
                      
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between items-center p-3 rounded-lg border border-gray-100">
                          <span className="font-semibold text-gray-700">周考核 (10-20条)</span>
                          {stats.weeklyPenalty > 0 && <span className="text-red-600 font-bold bg-red-50 px-2 py-1 rounded">罚 ¥{stats.weeklyPenalty} (差 {10 - stats.weekCount}条)</span>}
                          {stats.weeklyBonus > 0 && <span className="text-green-600 font-bold bg-green-50 px-2 py-1 rounded">奖 ¥{stats.weeklyBonus} (超 {stats.weekCount - 20}条)</span>}
                          {stats.weeklyPenalty === 0 && stats.weeklyBonus === 0 && <span className="text-gray-500 bg-gray-100 px-2 py-1 rounded">达标区</span>}
                        </div>

                        <div className="flex justify-between items-center p-3 rounded-lg border border-gray-100">
                          <span className="font-semibold text-gray-700">月考核 (60-90条)</span>
                          {stats.monthlyPenalty > 0 && <span className="text-red-600 font-bold bg-red-50 px-2 py-1 rounded">罚 ¥{stats.monthlyPenalty} (差 {60 - stats.monthCount}条)</span>}
                          {stats.monthlyBonus > 0 && <span className="text-green-600 font-bold bg-green-50 px-2 py-1 rounded">奖 ¥{stats.monthlyBonus} (超 {stats.monthCount - 90}条)</span>}
                          {stats.monthlyPenalty === 0 && stats.monthlyBonus === 0 && <span className="text-gray-500 bg-gray-100 px-2 py-1 rounded">达标区</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
