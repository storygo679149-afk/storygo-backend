import api from './api';

const novelService = {
  // Get all novels
  getAllNovels: (params = {}) => api.get('/novels', { params }),
  
  // Get my novels (creator)
  getMyNovels: (params = {}) => api.get('/novels', { params: { ...params, my_novels: true } }),
  
  // Get single novel with chapters
  getNovelById: (id) => api.get(`/novels/${id}`),
  
  // Get chapter content
  getChapter: (novelId, chapterId) => api.get(`/novels/${novelId}/chapters/${chapterId}`),
  
  // Create novel
  createNovel: (formData) => api.post('/novels', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  
  // Update novel
  updateNovel: (id, data) => {
    if (data instanceof FormData) {
      return api.put(`/novels/${id}`, data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    }
    return api.put(`/novels/${id}`, data);
  },
  
  // Delete novel
  deleteNovel: (id) => api.delete(`/novels/${id}`),
  
  // Add chapter to novel
  addChapter: (novelId, data) => api.post(`/novels/${novelId}/chapters`, data),
  
  // Toggle like
  toggleLike: (novelId) => api.post(`/novels/${novelId}/like`),
  
  // Save reading progress
  saveReadingProgress: (chapterId, scrollPosition) => api.post('/novels/reading-progress', { chapterId, scrollPosition }),
  
  // Search novels
  searchNovels: (query, params = {}) => api.get('/search', { params: { q: query, type: 'novels', ...params } })
};

export default novelService;