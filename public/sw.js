// Service worker tối thiểu để trình duyệt cho cài app (PWA):
// chỉ đăng ký lắng nghe fetch, không cache gì nên không bao giờ
// giữ lại bản cũ của app — mọi request đi thẳng ra mạng như thường.
self.addEventListener('fetch', () => {});
