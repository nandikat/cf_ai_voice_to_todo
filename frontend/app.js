// worker url
// const WORKER_URL = "http://localhost:8787/api/process"; 
const WORKER_URL = "https://voice-notes-backend.nandika.workers.dev/api/process";

// logic for recording
const recordBtn = document.getElementById('recordBtn');
const statusText = document.getElementById('status');
const resultCard = document.getElementById('resultCard');
const transcriptOutput = document.getElementById('transcriptOutput');
const tasksOutput = document.getElementById('tasksOutput');

let mediaRecorder;
let audioChunks = [];

recordBtn.addEventListener('click', async () => {
    if (recordBtn.innerText === 'Start Recording') {
        startRecording();
    } else {
        stopRecording();
    }
});

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = event => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = sendAudioToAI;
        mediaRecorder.start();
        
        recordBtn.innerText = 'Stop Recording';
        recordBtn.style.background = 'red';
        statusText.innerText = 'Listening...';
        resultCard.style.display = 'none';
        audioChunks = [];
    } catch (err) {
        statusText.innerText = "Permission Error :(.....Please try again :)";
    }
}

function stopRecording() {
    mediaRecorder.stop();
    recordBtn.innerText = 'Start Recording';
    recordBtn.style.background = '#de2196';
    statusText.innerText = 'Preparing your to do list......';
    recordBtn.disabled = true;
}

async function sendAudioToAI() {
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('audio', audioBlob);

    try {
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        transcriptOutput.innerText = `"${data.transcript}"`;
        tasksOutput.innerHTML = '';        
        if (data.tasks.length === 0) {
            tasksOutput.innerHTML = '<li><i>sorry....could not detect any tasks!.</i></li>';
        } else {
            data.tasks.forEach(task => {
                const li = document.createElement('li');
                li.innerText = task;
                tasksOutput.appendChild(li);
            });
        }
        statusText.innerText = 'Done!';
        resultCard.style.display = 'block';
    } catch (error) {
        statusText.innerText = `Error: ${error.message}`;
    } finally {
        recordBtn.disabled = false;
    }
}

// to get past tasks(history)
const loadHistoryBtn = document.getElementById('loadHistoryBtn');
const historyContainer = document.getElementById('historyContainer');

loadHistoryBtn.addEventListener('click', async () => {
    const HISTORY_URL = WORKER_URL.replace("/process", "/history");
    
    loadHistoryBtn.innerText = 'Loading...';
    loadHistoryBtn.disabled = true;

    try {
        const response = await fetch(HISTORY_URL);
        const historyData = await response.json();

        historyContainer.innerHTML = '';

        if (historyData.length === 0) {
            historyContainer.innerHTML = '<p>No history yet!...start adding your tasks now :)</p>';
            return;
        }

        historyData.forEach(note => {
            const dateObj = new Date(note.date + "Z"); 
            const dateString = dateObj.toLocaleString();

            const card = document.createElement('div');
            card.className = 'card';
            
            let tasksHtml = note.tasks.map(t => `<li>${t}</li>`).join('');
            if (note.tasks.length === 0) {
                tasksHtml = "<li><i>No actionable tasks found.</i></li>";
            }

            card.innerHTML = `
                <p style="font-size: 0.8rem; color: #666; margin-top: 0;">${dateString}</p>
                <p style="font-style: italic;">"${note.transcript}"</p>
                <ul style="margin-bottom: 0;">${tasksHtml}</ul>
            `;
            
            historyContainer.appendChild(card);
        });
    } catch (error) {
        historyContainer.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
    } finally {
        loadHistoryBtn.innerText = 'Load History';
        loadHistoryBtn.disabled = false;
    }
});