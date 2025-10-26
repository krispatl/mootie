// client.js - Modern Enhanced Version
import { initSpeechRecognition } from './speech-recognition.js';

class MootieApp {
  constructor() {
    this.currentMode = 'coach';
    this.isRecording = false;
    this.sources = [];
    this.isDebateMode = false;
    this.debateTimer = null;
    this.timeRemaining = 120; // 2 minutes
    
    this.initializeApp();
    this.bindEvents();
    this.loadSources();
    this.showOnboarding();
  }

  initializeApp() {
    // Initialize speech recognition
    this.speechRecognition = initSpeechRecognition(
      (text) => this.onTranscription(text),
      () => this.onRecordingStart(),
      () => this.onRecordingEnd()
    );

    // Initialize UI components
    this.updateModeDisplay();
    this.setupTextInput();
  }

  bindEvents() {
    // Mode switching
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.setMode(e.currentTarget.dataset.mode);
      });
    });

    // Recording
    const recordBtn = document.getElementById('recordBtn');
    recordBtn.addEventListener('mousedown', () => this.startRecording());
    recordBtn.addEventListener('mouseup', () => this.stopRecording());
    recordBtn.addEventListener('mouseleave', () => this.stopRecording());

    // Text input
    const textInput = document.getElementById('textInput');
    const sendBtn = document.getElementById('sendBtn');
    
    textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    sendBtn.addEventListener('click', () => this.sendMessage());

    // File upload
    const uploadBtn = document.getElementById('uploadBtn');
    const fileInput = document.getElementById('fileInput');
    
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => this.handleFileUpload(e));

    // Debate mode
    const debateToggle = document.getElementById('debateToggle');
    debateToggle.addEventListener('click', () => this.toggleDebateMode());

    // Analytics
    document.getElementById('coachFeedbackBtn').addEventListener('click', () => this.getCoachFeedback());
    document.getElementById('exportTranscript').addEventListener('click', () => this.exportTranscript());

    // Help
    document.getElementById('helpButton').addEventListener('click', () => this.showHelp());
    document.getElementById('closeHelp').addEventListener('click', () => this.hideHelp());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.target.matches('textarea, input')) {
        e.preventDefault();
        this.toggleRecording();
      }
    });
  }

  setMode(mode) {
    this.currentMode = mode;
    
    // Update UI
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // Update session info
    const sessionInfo = document.getElementById('sessionInfo');
    const icons = {
      coach: 'fa-user-graduate',
      judge: 'fa-gavel',
      opposition: 'fa-people-arrows'
    };
    const labels = {
      coach: 'Coach Mode',
      judge: 'Judge Mode',
      opposition: 'Opposition Mode'
    };

    sessionInfo.innerHTML = `
      <i class="fas ${icons[mode]}"></i>
      <span>${labels[mode]}</span>
    `;

    this.addSystemMessage(`Switched to ${labels[mode]}. Ready for your arguments.`);
  }

  async startRecording() {
    if (this.isRecording) return;
    
    try {
      this.isRecording = true;
      document.getElementById('recordBtn').classList.add('recording');
      await this.speechRecognition.start();
    } catch (error) {
      console.error('Recording error:', error);
      this.addSystemMessage('Error starting recording. Please check microphone permissions.');
      this.stopRecording();
    }
  }

  async stopRecording() {
    if (!this.isRecording) return;
    
    this.isRecording = false;
    document.getElementById('recordBtn').classList.remove('recording');
    await this.speechRecognition.stop();
  }

  toggleRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }

  onTranscription(text) {
    if (text.trim()) {
      document.getElementById('textInput').value = text;
      this.sendMessage();
    }
  }

  onRecordingStart() {
    this.addSystemMessage('Recording started... Speak now.');
  }

  onRecordingEnd() {
    // Recording end handled by transcription
  }

  setupTextInput() {
    const textInput = document.getElementById('textInput');
    
    textInput.addEventListener('input', () => {
      // Auto-resize
      textInput.style.height = 'auto';
      textInput.style.height = Math.min(textInput.scrollHeight, 120) + 'px';
    });
  }

  async sendMessage() {
    const textInput = document.getElementById('textInput');
    const message = textInput.value.trim();
    
    if (!message) return;

    // Add user message
    this.addMessage('user', message);
    textInput.value = '';
    textInput.style.height = 'auto';

    // Show typing indicator
    this.showTypingIndicator();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          mode: this.currentMode,
          sources: this.sources.map(s => s.id)
        }),
      });

      const data = await response.json();

      if (data.success) {
        this.addMessage('assistant', data.response, data.references);
        this.updateScores(data.scores);
      } else {
        throw new Error(data.error || 'Failed to get response');
      }
    } catch (error) {
      console.error('Chat error:', error);
      this.addMessage('assistant', 'Sorry, I encountered an error. Please try again.');
    } finally {
      this.hideTypingIndicator();
    }
  }

  addMessage(role, content, references = null) {
    const messagesContainer = document.getElementById('messages');
    
    // Remove welcome message if it's the first real message
    const welcomeMessage = messagesContainer.querySelector('.welcome-message');
    if (welcomeMessage && role === 'user') {
      welcomeMessage.remove();
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const timestamp = new Date().toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    let referencesHtml = '';
    if (references && references.length > 0) {
      referencesHtml = `
        <div class="message-references">
          Sources: ${references.join(', ')}
        </div>
      `;
    }

    messageDiv.innerHTML = `
      <div class="message-meta">
        ${role === 'user' ? 'You' : 'Mootie'} • ${timestamp}
      </div>
      <div class="message-bubble">
        <div class="message-content">${this.formatMessage(content)}</div>
        ${referencesHtml}
      </div>
    `;

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  addSystemMessage(content) {
    this.addMessage('assistant', content);
  }

  formatMessage(content) {
    // Convert markdown-like formatting to HTML
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  showTypingIndicator() {
    document.getElementById('typingIndicator').classList.remove('hidden');
    document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
  }

  hideTypingIndicator() {
    document.getElementById('typingIndicator').classList.add('hidden');
  }

  async handleFileUpload(event) {
    const files = Array.from(event.target.files);
    
    for (const file of files) {
      await this.uploadFile(file);
    }
    
    // Reset file input
    event.target.value = '';
  }

  async uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
      this.addSystemMessage(`Uploading ${file.name}...`);
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        this.sources.push({
          id: data.fileId,
          name: file.name,
          type: file.type
        });
        this.updateSourceList();
        this.addSystemMessage(`Successfully uploaded ${file.name}`);
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      this.addSystemMessage(`Failed to upload ${file.name}: ${error.message}`);
    }
  }

  async deleteFile(fileId) {
    try {
      const response = await fetch(`/api/delete-file?fileId=${fileId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        this.sources = this.sources.filter(s => s.id !== fileId);
        this.updateSourceList();
        this.addSystemMessage('File deleted successfully');
      } else {
        throw new Error(data.error || 'Delete failed');
      }
    } catch (error) {
      console.error('Delete error:', error);
      this.addSystemMessage(`Failed to delete file: ${error.message}`);
    }
  }

  updateSourceList() {
    const sourceList = document.getElementById('sourceList');
    
    if (this.sources.length === 0) {
      sourceList.innerHTML = '<li class="empty-state">No documents uploaded</li>';
      return;
    }

    sourceList.innerHTML = this.sources.map(source => `
      <li>
        <span class="file-name" title="${source.name}">${this.truncateFileName(source.name)}</span>
        <button class="delete-btn" onclick="app.deleteFile('${source.id}')" title="Delete file">
          <i class="fas fa-trash"></i>
        </button>
      </li>
    `).join('');
  }

  truncateFileName(name, maxLength = 25) {
    return name.length > maxLength ? name.substring(0, maxLength - 3) + '...' : name;
  }

  async loadSources() {
    try {
      const response = await fetch('/api/list-files');
      const data = await response.json();
      
      if (data.success) {
        this.sources = data.files || [];
        this.updateSourceList();
      }
    } catch (error) {
      console.error('Error loading sources:', error);
    }
  }

  updateScores(scores) {
    if (!scores) return;

    const metrics = ['Clarity', 'Structure', 'Authority', 'Responsiveness', 'Persuasiveness'];
    
    metrics.forEach(metric => {
      const score = scores[metric.toLowerCase()] || 0;
      const element = document.getElementById(`score${metric}`);
      
      if (element) {
        const valueElement = element.querySelector('.metric-value');
        const fillElement = element.querySelector('.metric-fill');
        
        valueElement.textContent = score.toFixed(1);
        fillElement.style.width = `${score * 10}%`;
      }
    });
  }

  toggleDebateMode() {
    this.isDebateMode = !this.isDebateMode;
    const debateToggle = document.getElementById('debateToggle');
    const debateStatus = document.getElementById('debateStatus');
    
    if (this.isDebateMode) {
      debateToggle.innerHTML = '<i class="fas fa-stop"></i><span>End Debate</span>';
      debateStatus.classList.remove('hidden');
      this.startDebateTimer();
      this.addSystemMessage('Debate session started! You have 2 minutes per turn.');
    } else {
      debateToggle.innerHTML = '<i class="fas fa-gavel"></i><span>Start Debate</span>';
      debateStatus.classList.add('hidden');
      this.stopDebateTimer();
      this.addSystemMessage('Debate session ended.');
    }
  }

  startDebateTimer() {
    this.timeRemaining = 120;
    this.updateTimerDisplay();
    
    this.debateTimer = setInterval(() => {
      this.timeRemaining--;
      this.updateTimerDisplay();
      
      if (this.timeRemaining <= 0) {
        this.endTurn();
      }
    }, 1000);
  }

  stopDebateTimer() {
    if (this.debateTimer) {
      clearInterval(this.debateTimer);
      this.debateTimer = null;
    }
  }

  updateTimerDisplay() {
    const minutes = Math.floor(this.timeRemaining / 60);
    const seconds = this.timeRemaining % 60;
    document.getElementById('timerLabel').textContent = 
      `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    // Update progress bar
    const progress = (120 - this.timeRemaining) / 120 * 100;
    document.getElementById('progressFill').style.width = `${progress}%`;
  }

  endTurn() {
    this.stopDebateTimer();
    this.addSystemMessage('Time\'s up! Switching to opposition...');
    // Add logic for automatic turn switching
  }

  async getCoachFeedback() {
    this.addSystemMessage('Generating comprehensive feedback...');
    
    try {
      const response = await fetch('/api/coach-feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (data.success) {
        this.addMessage('assistant', data.feedback);
      } else {
        throw new Error(data.error || 'Failed to get feedback');
      }
    } catch (error) {
      console.error('Feedback error:', error);
      this.addMessage('assistant', 'Sorry, I couldn\'t generate feedback at this time.');
    }
  }

  exportTranscript() {
    const messages = Array.from(document.querySelectorAll('.message'))
      .map(msg => {
        const role = msg.classList.contains('user') ? 'You' : 'Mootie';
        const content = msg.querySelector('.message-content').textContent;
        return `${role}: ${content}`;
      })
      .join('\n\n');

    const blob = new Blob([messages], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mootie-transcript-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    this.addSystemMessage('Transcript exported successfully.');
  }

  showOnboarding() {
    // Simple onboarding - you can expand this
    const hasSeenOnboarding = localStorage.getItem('mootie-onboarding-seen');
    
    if (!hasSeenOnboarding) {
      this.addSystemMessage('Welcome to Mootie! I\'m your AI Moot Court Coach. You can switch between Coach, Judge, and Opposition modes, upload case documents, and practice your arguments with real-time feedback.');
      localStorage.setItem('mootie-onboarding-seen', 'true');
    }
  }

  showHelp() {
    document.getElementById('helpOverlay').classList.remove('hidden');
  }

  hideHelp() {
    document.getElementById('helpOverlay').classList.add('hidden');
  }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.app = new MootieApp();
});

// Export for use in other modules
export default MootieApp;
