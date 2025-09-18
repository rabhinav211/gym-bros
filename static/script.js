// Medical Report Simplifier - Enhanced JavaScript Functionality

class MedicalReportApp {
    constructor() {
        this.sessionId = null;
        this.ttsEnabled = true;
        this.isUploading = false;
        this.isSending = false;
        this.currentUtterance = null;
        this.recognition = null;
        this.isRecording = false;
        this.theme = localStorage.getItem('theme') || 'light';
        
        this.initializeApp();
        this.setupEventListeners();
        this.setupSpeechRecognition();
        this.applyTheme();
    }

    initializeApp() {
        // Auto-resize textarea
        this.setupTextareaAutoResize();
        
        // Check for speech synthesis support
        if (!('speechSynthesis' in window)) {
            const ttsButtons = document.querySelectorAll('[data-tts]');
            ttsButtons.forEach(btn => btn.style.display = 'none');
        }
        
        console.log('Medical Report Simplifier initialized');
    }

    setupEventListeners() {
        // File input
        const fileInput = document.getElementById('fileInput');
        const uploadArea = document.getElementById('uploadArea');
        
        if (fileInput) fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        // Drag and drop
        if (uploadArea) {
            uploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
            uploadArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
            uploadArea.addEventListener('drop', this.handleDrop.bind(this));
        }
        
        // Message input
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.addEventListener('input', this.handleMessageInput.bind(this));
            messageInput.addEventListener('keydown', this.handleKeyDown.bind(this));
            messageInput.addEventListener('input', this.updateCharCounter.bind(this));
        }
        
        // Language selector
        const languageSelect = document.getElementById('languageSelect');
        if (languageSelect) {
            languageSelect.addEventListener('change', this.handleLanguageChange.bind(this));
        }
        
        // Send button
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendMessage());
        }
    }

    setupSpeechRecognition() {
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-US';
            
            this.recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                const messageInput = document.getElementById('messageInput');
                if (messageInput) {
                    messageInput.value = transcript;
                    this.handleMessageInput({ target: messageInput });
                    this.updateCharCounter();
                }
            };
            
            this.recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                this.stopSpeechToText();
                this.showToast('Speech recognition failed. Please try again.', 'error');
            };
            
            this.recognition.onend = () => {
                this.stopSpeechToText();
            };
        } else {
            // Hide microphone button if not supported
            const micBtn = document.getElementById('micBtn');
            if (micBtn) micBtn.style.display = 'none';
        }
    }

    setupTextareaAutoResize() {
        const textarea = document.getElementById('messageInput');
        if (textarea) {
            textarea.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 120) + 'px';
            });
        }
    }

    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.theme);
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) {
            const icon = themeToggle.querySelector('i');
            if (icon) {
                icon.className = this.theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
            }
        }
    }

    toggleTheme() {
        this.theme = this.theme === 'light' ? 'dark' : 'light';
        localStorage.setItem('theme', this.theme);
        this.applyTheme();
        this.showToast(`${this.theme === 'dark' ? 'Dark' : 'Light'} mode enabled`, 'success');
    }

    handleDragOver(e) {
        e.preventDefault();
        document.getElementById('uploadArea').classList.add('dragover');
    }

    handleDragLeave(e) {
        e.preventDefault();
        document.getElementById('uploadArea').classList.remove('dragover');
    }

    handleDrop(e) {
        e.preventDefault();
        document.getElementById('uploadArea').classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.processFile(files[0]);
        }
    }

    handleFileSelect(e) {
        const files = e.target.files;
        if (files.length > 0) {
            this.processFile(files[0]);
        }
    }

    async processFile(file) {
        if (this.isUploading) return;
        
        // Validate file
        if (!file.type.includes('pdf')) {
            this.showToast('Please select a PDF file.', 'error');
            return;
        }
        
        if (file.size > 16 * 1024 * 1024) {
            this.showToast('File size must be less than 16MB.', 'error');
            return;
        }
        
        this.isUploading = true;
        this.showLoadingOverlay('Processing your document...');
        
        try {
            const formData = new FormData();
            formData.append('file', file);
            if (this.sessionId) {
                formData.append('session_id', this.sessionId);
            }
            
            const response = await fetch('/upload_pdf', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.sessionId = result.session_id;
                this.showChatInterface();
                this.addPDFUploadMessage(file.name);
                
                // Check if lab data is available and show visualization button
                if (result.has_lab_data && result.lab_data && result.lab_data.length > 0) {
                    const visualizeBtn = document.getElementById('visualizeBtn');
                    if (visualizeBtn) {
                        visualizeBtn.style.display = 'flex';
                        visualizeBtn.setAttribute('data-session-id', result.session_id);
                    }
                    
                    // Add lab data welcome message
                    this.addLabDataMessage(result.lab_data);
                } else {
                    // Add regular welcome message
                    this.addWelcomeMessage();
                }
                
                this.showToast('Medical report processed successfully!', 'success');
            } else {
                this.showToast(result.error || 'Failed to process PDF', 'error');
            }
        } catch (error) {
            this.showToast('Error uploading file: ' + error.message, 'error');
        } finally {
            this.isUploading = false;
            this.hideLoadingOverlay();
        }
    }

    showChatInterface() {
        document.getElementById('uploadSection').style.display = 'none';
        document.getElementById('chatContainer').style.display = 'flex';
        document.getElementById('inputBar').style.display = 'block';
        
        // Focus on message input
        setTimeout(() => {
            const messageInput = document.getElementById('messageInput');
            if (messageInput) messageInput.focus();
        }, 300);
    }

    addPDFUploadMessage(filename) {
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const messageHtml = `
            <div class="message assistant-message" data-timestamp="${timestamp}">
                <div class="message-avatar">
                    <i class="fas fa-robot"></i>
                </div>
                <div class="message-content">
                    <div class="message-bubble">
                        📄 Report "${filename}" has been uploaded and processed successfully. I'm ready to help you understand your medical results!
                    </div>
                    <div class="message-timestamp">${timestamp}</div>
                </div>
            </div>
        `;
        
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.insertAdjacentHTML('beforeend', messageHtml);
            this.scrollToBottom();
        }
    }

    addWelcomeMessage() {
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const messageHtml = `
            <div class="message assistant-message" data-timestamp="${timestamp}">
                <div class="message-avatar">
                    <i class="fas fa-robot"></i>
                </div>
                <div class="message-content">
                    <div class="message-bubble">
                        Hello! I've analyzed your medical report and I'm here to help explain it in simple terms. Feel free to ask me about:
                        <br>• What your test results mean
                        <br>• Any abnormal or concerning values
                        <br>• Next steps or recommendations
                        <br>• Specific medical terms you don't understand
                        
                        What would you like to know?
                    </div>
                    <div class="message-timestamp">${timestamp}</div>
                    <div class="message-actions">
                        <button class="action-btn" onclick="app.speakText(this.closest('.message-content').querySelector('.message-bubble').textContent, this)" title="Read aloud">
                            <i class="fas fa-volume-up"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.insertAdjacentHTML('beforeend', messageHtml);
            this.scrollToBottom();
        }
    }

    addLabDataMessage(labData) {
        const testsList = labData.map(test => 
            `• <strong>${test.test}</strong>: ${test.value} ${test.unit} (${test.status})`
        ).join('<br>');
        
        const message = `🧪 <strong>Lab Data Detected!</strong><br><br>
I found ${labData.length} lab test(s) in your report. I can help explain these results, or you can click the chart button (📊) above to see interactive visualizations.<br><br>
<strong>Available Tests:</strong><br>
${testsList}<br><br>
What would you like to know about your results?`;

        this.addMessageToChat(message, 'assistant');
    }

    handleMessageInput(e) {
        const sendBtn = document.getElementById('sendBtn');
        const message = e.target.value.trim();
        if (sendBtn) {
            sendBtn.disabled = !message || this.isSending;
        }
    }

    handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage();
        }
    }

    updateCharCounter() {
        const messageInput = document.getElementById('messageInput');
        const charCounter = document.getElementById('charCounter');
        
        if (messageInput && charCounter) {
            const currentLength = messageInput.value.length;
            const maxLength = messageInput.getAttribute('maxlength') || 1000;
            
            charCounter.textContent = `${currentLength}/${maxLength}`;
            
            if (currentLength > maxLength * 0.9) {
                charCounter.style.color = 'var(--danger-color)';
            } else {
                charCounter.style.color = 'var(--text-muted)';
            }
        }
    }

    async sendMessage() {
        if (this.isSending) return;
        
        const messageInput = document.getElementById('messageInput');
        const message = messageInput?.value.trim();
        
        if (!message || !this.sessionId) return;
        
        this.isSending = true;
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) sendBtn.disabled = true;
        
        // Add user message to chat
        this.addMessageToChat(message, 'user');
        messageInput.value = '';
        messageInput.style.height = 'auto';
        this.updateCharCounter();
        
        // Show typing indicator
        this.showTypingIndicator();
        
        try {
            const languageSelect = document.getElementById('languageSelect');
            const selectedLanguage = languageSelect?.value || 'English';
            
            const response = await fetch('/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: this.sessionId,
                    message: message,
                    language: selectedLanguage
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                // Process response for lab value highlighting
                const processedResponse = this.highlightLabValues(result.response);
                this.addMessageToChat(processedResponse, 'assistant');
                
                // Text-to-speech
                if (this.ttsEnabled) {
                    // Small delay to let message render
                    setTimeout(() => {
                        this.speakText(result.response);
                    }, 500);
                }
            } else {
                this.showToast(result.error || 'Failed to get response', 'error');
            }
        } catch (error) {
            this.showToast('Error sending message: ' + error.message, 'error');
        } finally {
            this.isSending = false;
            if (sendBtn) sendBtn.disabled = false;
            this.hideTypingIndicator();
        }
    }

    addMessageToChat(message, role) {
        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const isUser = role === 'user';
        
        // Process message content
        let processedMessage = message;
        if (!isUser) {
            // Render markdown for assistant messages
            processedMessage = this.renderMarkdown(message);
        } else {
            // Escape HTML for user messages
            processedMessage = this.escapeHtml(message);
        }
        
        const messageHtml = `
            <div class="message ${role}-message" data-timestamp="${timestamp}">
                <div class="message-avatar">
                    <i class="fas fa-${isUser ? 'user' : 'robot'}"></i>
                </div>
                <div class="message-content">
                    <div class="message-bubble">
                        ${processedMessage}
                    </div>
                    <div class="message-timestamp">${timestamp}</div>
                    ${!isUser ? `
                        <div class="message-actions">
                            <button class="action-btn" onclick="app.speakText(this.closest('.message-content').querySelector('.message-bubble').textContent, this)" title="Read aloud">
                                <i class="fas fa-volume-up"></i>
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.insertAdjacentHTML('beforeend', messageHtml);
            this.scrollToBottom();
        }
    }

    renderMarkdown(text) {
        try {
            // Configure marked options for safe rendering
            marked.setOptions({
                breaks: true,
                gfm: true,
                sanitize: false,
                smartLists: true,
                smartypants: false
            });
            
            // Apply lab value highlighting before markdown rendering
            const highlightedText = this.highlightLabValues(text);
            
            // Render markdown
            return marked.parse(highlightedText);
        } catch (error) {
            console.error('Markdown rendering error:', error);
            // Fallback to highlighted text with line breaks
            return this.highlightLabValues(text).replace(/\n/g, '<br>');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    highlightLabValues(text) {
        // Enhanced pattern to match lab values in different formats
        const patterns = [
            // Format: [TYPE:value]
            /\[(NORMAL|SLIGHTLY_ABNORMAL|CRITICAL):([^\]]+)\]/g,
            // Format: Normal/Abnormal/Critical values with units
            /(\d+(?:\.\d+)?)\s*(mg\/dL|mmol\/L|ng\/mL|pg\/mL|IU\/L|U\/L|%|\/μL|cells\/μL|thousand\/μL|million\/μL)\s*\(?(normal|slightly abnormal|abnormal|critical|elevated|decreased|low|high)\)?/gi
        ];
        
        let processedText = text;
        
        // Apply first pattern
        processedText = processedText.replace(patterns[0], (match, type, value) => {
            const className = type.toLowerCase().replace('_', '-');
            return `<span class="lab-value ${className}">${value}</span>`;
        });
        
        // Apply second pattern for natural language lab values
        processedText = processedText.replace(patterns[1], (match, value, unit, status) => {
            let className = 'normal';
            const statusLower = status.toLowerCase();
            
            if (statusLower.includes('critical') || statusLower.includes('very high') || statusLower.includes('very low')) {
                className = 'critical';
            } else if (statusLower.includes('abnormal') || statusLower.includes('elevated') || statusLower.includes('high') || statusLower.includes('low')) {
                className = 'slightly-abnormal';
            }
            
            return `<span class="lab-value ${className}">${value} ${unit}</span> (${status})`;
        });
        
        return processedText;
    }

    showTypingIndicator() {
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            typingIndicator.style.display = 'flex';
            this.scrollToBottom();
        }
    }

    hideTypingIndicator() {
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            typingIndicator.style.display = 'none';
        }
    }

    scrollToBottom() {
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            setTimeout(() => {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }, 100);
        }
    }

    showLoadingOverlay(text = 'Processing...') {
        const overlay = document.getElementById('loadingOverlay');
        const loadingText = document.getElementById('loadingText');
        
        if (overlay) overlay.style.display = 'flex';
        if (loadingText) loadingText.textContent = text;
    }

    hideLoadingOverlay() {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    toggleSpeechToText() {
        if (!this.recognition) {
            this.showToast('Speech recognition not supported in this browser', 'warning');
            return;
        }
        
        if (this.isRecording) {
            this.stopSpeechToText();
        } else {
            this.startSpeechToText();
        }
    }

    startSpeechToText() {
        if (!this.recognition) return;
        
        this.isRecording = true;
        const micBtn = document.getElementById('micBtn');
        const voiceModal = document.getElementById('voiceModal');
        
        if (micBtn) micBtn.classList.add('recording');
        if (voiceModal) voiceModal.style.display = 'flex';
        
        this.recognition.start();
        this.showToast('Listening... Speak now', 'success');
    }

    stopSpeechToText() {
        if (!this.recognition) return;
        
        this.isRecording = false;
        const micBtn = document.getElementById('micBtn');
        const voiceModal = document.getElementById('voiceModal');
        
        if (micBtn) micBtn.classList.remove('recording');
        if (voiceModal) voiceModal.style.display = 'none';
        
        this.recognition.stop();
    }

    speakText(text, button = null) {
        if (!('speechSynthesis' in window)) {
            this.showToast('Text-to-speech not supported in this browser', 'warning');
            return;
        }
        
        // Stop current speech
        if (this.currentUtterance) {
            speechSynthesis.cancel();
        }
        
        // Clean text for speech (remove HTML tags and lab value markers)
        const cleanText = text
            .replace(/<[^>]*>/g, '')
            .replace(/\[(NORMAL|SLIGHTLY_ABNORMAL|CRITICAL):[^\]]+\]/g, '')
            .replace(/📄|•/g, '');
        
        this.currentUtterance = new SpeechSynthesisUtterance(cleanText);
        this.currentUtterance.rate = 0.9;
        this.currentUtterance.pitch = 1;
        this.currentUtterance.volume = 0.8;
        
        // Update button state
        if (button) {
            const icon = button.querySelector('i');
            if (icon) {
                icon.className = 'fas fa-stop';
                button.style.color = 'var(--danger-color)';
            }
        }
        
        this.currentUtterance.onend = () => {
            if (button) {
                const icon = button.querySelector('i');
                if (icon) {
                    icon.className = 'fas fa-volume-up';
                    button.style.color = '';
                }
            }
            this.currentUtterance = null;
        };
        
        speechSynthesis.speak(this.currentUtterance);
    }

    handleLanguageChange() {
        if (this.sessionId) {
            const languageSelect = document.getElementById('languageSelect');
            const selectedLanguage = languageSelect?.value || 'English';
            this.showToast(`Language changed to ${selectedLanguage}`, 'success');
        }
    }

    setQuickQuestion(question) {
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.value = question;
            messageInput.focus();
            this.handleMessageInput({ target: messageInput });
            this.updateCharCounter();
        }
    }

    toggleTTS() {
        this.ttsEnabled = !this.ttsEnabled;
        const ttsIcon = document.getElementById('ttsIcon');
        const ttsStatus = document.getElementById('ttsStatus');
        
        if (ttsIcon) {
            ttsIcon.className = this.ttsEnabled ? 'fas fa-volume-up' : 'fas fa-volume-mute';
        }
        
        if (ttsStatus) {
            ttsStatus.textContent = `TTS: ${this.ttsEnabled ? 'On' : 'Off'}`;
        }
        
        // Stop current speech if disabling
        if (!this.ttsEnabled && speechSynthesis.speaking) {
            speechSynthesis.cancel();
        }
        
        this.showToast(`Text-to-speech ${this.ttsEnabled ? 'enabled' : 'disabled'}`, 'success');
    }

    toggleMobileMenu() {
        const mobileMenu = document.getElementById('mobileMenu');
        if (mobileMenu) {
            const isVisible = mobileMenu.style.display === 'block';
            mobileMenu.style.display = isVisible ? 'none' : 'block';
        }
    }

    async exportConversation() {
        if (!this.sessionId) {
            this.showToast('No conversation to export', 'warning');
            return;
        }
        
        try {
            this.showLoadingOverlay('Generating PDF...');
            
            const response = await fetch('/export_conversation', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: this.sessionId
                })
            });
            
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `medical_conversation_${new Date().toISOString().split('T')[0]}.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                this.showToast('Conversation exported successfully!', 'success');
            } else {
                const result = await response.json();
                this.showToast(result.error || 'Failed to export conversation', 'error');
            }
        } catch (error) {
            this.showToast('Error exporting conversation: ' + error.message, 'error');
        } finally {
            this.hideLoadingOverlay();
        }
    }

    async clearSession() {
        if (!this.sessionId) {
            return;
        }
        
        if (!confirm('Are you sure you want to clear the current session? This will delete your uploaded report and conversation history.')) {
            return;
        }
        
        try {
            await fetch('/clear_session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: this.sessionId
                })
            });
        } catch (error) {
            console.error('Error clearing session:', error);
        }
        
        // Reset UI
        this.sessionId = null;
        document.getElementById('uploadSection').style.display = 'block';
        document.getElementById('chatContainer').style.display = 'none';
        document.getElementById('inputBar').style.display = 'none';
        
        const fileInput = document.getElementById('fileInput');
        if (fileInput) fileInput.value = '';
        
        // Clear chat messages
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) chatMessages.innerHTML = '';
        
        this.showToast('Session cleared successfully', 'success');
    }

    showToast(message, type = 'success') {
        const toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const icons = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        
        const icon = icons[type] || icons.info;
        
        toast.innerHTML = `
            <i class="fas fa-${icon}"></i>
            <span>${message}</span>
        `;
        
        toastContainer.appendChild(toast);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.animation = 'toastSlide 0.3s ease reverse';
                setTimeout(() => {
                    if (toast.parentNode) {
                        toastContainer.removeChild(toast);
                    }
                }, 300);
            }
        }, 5000);
        
        // Click to dismiss
        toast.addEventListener('click', () => {
            if (toast.parentNode) {
                toastContainer.removeChild(toast);
            }
        });
    }

    // Lab Analysis Methods
    setupLabAnalysis() {
        const labFileInput = document.getElementById('labFileInput');
        const labUploadArea = document.getElementById('labUploadArea');
        
        if (labFileInput) {
            labFileInput.addEventListener('change', (e) => this.handleLabFileSelect(e));
        }
        
        if (labUploadArea) {
            labUploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
            labUploadArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
            labUploadArea.addEventListener('drop', (e) => this.handleLabDrop(e));
        }
    }

    async handleLabFileSelect(event) {
        const files = event.target.files;
        if (files.length > 0) {
            await this.uploadLabReport(files[0]);
        }
    }

    async handleLabDrop(event) {
        event.preventDefault();
        const files = event.dataTransfer.files;
        const uploadArea = event.target.closest('.upload-area');
        
        if (uploadArea) {
            uploadArea.classList.remove('dragover');
        }
        
        if (files.length > 0 && files[0].type === 'application/pdf') {
            await this.uploadLabReport(files[0]);
        } else {
            this.showToast('Please upload a PDF file', 'error');
        }
    }

    async uploadLabReport(file) {
        if (this.isUploading) return;
        
        this.isUploading = true;
        this.showLabUploadProgress(true);
        
        try {
            const formData = new FormData();
            formData.append('file', file);
            
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.showToast('Lab report processed successfully!', 'success');
                // Redirect to results page
                window.location.href = `/results/${result.session_id}`;
            } else {
                throw new Error(result.error || 'Upload failed');
            }
        } catch (error) {
            console.error('Lab upload error:', error);
            this.showToast(error.message || 'Failed to process lab report', 'error');
        } finally {
            this.isUploading = false;
            this.showLabUploadProgress(false);
        }
    }

    showLabUploadProgress(show) {
        const progressElement = document.getElementById('labUploadProgress');
        const statusElement = document.getElementById('labUploadStatus');
        
        if (progressElement) {
            progressElement.style.display = show ? 'block' : 'none';
        }
        
        if (show && statusElement) {
            let dots = 0;
            const statusMessages = [
                'Extracting text from PDF...',
                'Analyzing lab values...',
                'Processing results...',
                'Creating visualizations...'
            ];
            let messageIndex = 0;
            
            const updateStatus = () => {
                if (!this.isUploading) return;
                
                dots = (dots + 1) % 4;
                const message = statusMessages[messageIndex] + '.'.repeat(dots);
                statusElement.textContent = message;
                
                if (dots === 0) {
                    messageIndex = (messageIndex + 1) % statusMessages.length;
                }
                
                setTimeout(updateStatus, 500);
            };
            
            updateStatus();
        }
    }
}

// Global functions for HTML onclick handlers
let app;

function selectAnalysisType(type) {
    const uploadSection = document.getElementById('uploadSection');
    const labUploadSection = document.getElementById('labUploadSection');
    
    // Reset button states
    document.querySelectorAll('.analysis-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    if (type === 'chat') {
        document.getElementById('chatAnalysisBtn').classList.add('selected');
        if (labUploadSection) labUploadSection.style.display = 'none';
        if (uploadSection) uploadSection.style.display = 'flex';
    } else if (type === 'lab') {
        document.getElementById('labAnalysisBtn').classList.add('selected');
        if (uploadSection) uploadSection.style.display = 'none';
        if (labUploadSection) {
            labUploadSection.style.display = 'flex';
            // Setup lab analysis if not already done
            if (app && !app.labAnalysisSetup) {
                app.setupLabAnalysis();
                app.labAnalysisSetup = true;
            }
        }
    }
}

// Global functions for HTML onclick handlers

function showVisualization() {
    const visualizeBtn = document.getElementById('visualizeBtn');
    const sessionId = visualizeBtn ? visualizeBtn.getAttribute('data-session-id') : null;
    
    if (sessionId) {
        // Open visualization in new tab
        window.open(`/results/${sessionId}`, '_blank');
    } else {
        app.showToast('No lab data available for visualization', 'warning');
    }
}

function exportConversation() {
    if (app) app.exportConversation();
}

function clearSession() {
    if (app) app.clearSession();
}

function toggleTheme() {
    if (app) app.toggleTheme();
}

function toggleTTS() {
    if (app) app.toggleTTS();
}

function toggleMobileMenu() {
    if (app) app.toggleMobileMenu();
}

function setQuickQuestion(question) {
    if (app) app.setQuickQuestion(question);
}

function speakText(text, button) {
    if (app) app.speakText(text, button);
}

function sendMessage() {
    if (app) app.sendMessage();
}

function toggleSpeechToText() {
    if (app) app.toggleSpeechToText();
}

function stopSpeechToText() {
    if (app) app.stopSpeechToText();
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    app = new MedicalReportApp();
    
    // Service worker registration for PWA (optional)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/static/sw.js').catch(console.error);
    }
});

// Handle page visibility change
document.addEventListener('visibilitychange', () => {
    if (document.hidden && speechSynthesis.speaking) {
        speechSynthesis.pause();
    } else if (!document.hidden && speechSynthesis.paused) {
        speechSynthesis.resume();
    }
});

// Handle beforeunload
window.addEventListener('beforeunload', (e) => {
    if (app && app.sessionId) {
        e.preventDefault();
        e.returnValue = 'You have an active session. Are you sure you want to leave?';
    }
});

// Close mobile menu when clicking outside
document.addEventListener('click', (e) => {
    const mobileMenu = document.getElementById('mobileMenu');
    const menuToggle = document.getElementById('menuToggle');
    
    if (mobileMenu && menuToggle && 
        !mobileMenu.contains(e.target) && 
        !menuToggle.contains(e.target)) {
        mobileMenu.style.display = 'none';
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter to send message
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (app) app.sendMessage();
    }
    
    // Escape to close modals
    if (e.key === 'Escape') {
        const voiceModal = document.getElementById('voiceModal');
        const mobileMenu = document.getElementById('mobileMenu');
        
        if (voiceModal && voiceModal.style.display === 'flex') {
            if (app) app.stopSpeechToText();
        }
        
        if (mobileMenu && mobileMenu.style.display === 'block') {
            mobileMenu.style.display = 'none';
        }
    }
});