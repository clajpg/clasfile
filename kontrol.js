// Variables for temperature monitoring
let port;
let reader;
let writer;
let encoder = new TextEncoder();
let decoder = new TextDecoder();
let simulationInterval;
let useSimulation = false;

// Status variables
let isConnected = false;
let simulationTime = 0;
let setPoint = 25;
let actualTemperature = 0;
let voltage = 0;
let rawADC = 0;
let kp = 0.5;
let useImprovedAlgorithm = true;
let isRecording = false;
let recordingStartTime = 0;
let recordedData = [];

// Chart initialization
const ctx = document.getElementById('temperatureChart').getContext('2d');

// Set Chart.js defaults for dark theme
Chart.defaults.color = '#AAAAAA';
Chart.defaults.borderColor = '#333333';

const temperatureChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [],
        datasets: [
            {
                label: 'Set Point',
                data: [],
                borderColor: '#F44336',
                backgroundColor: 'rgba(244, 67, 54, 0.1)',
                borderWidth: 2,
                tension: 0.2,
                pointRadius: 0,
                pointHoverRadius: 4
            },
            {
                label: 'Actual Temperature',
                data: [],
                borderColor: '#7C4DFF',
                backgroundColor: 'rgba(124, 77, 255, 0.1)',
                borderWidth: 2,
                tension: 0.2,
                pointRadius: 0,
                pointHoverRadius: 4
            }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {
                title: {
                    display: true,
                    text: 'Time (s)'
                },
                grid: {
                    color: 'rgba(255, 255, 255, 0.05)'
                }
            },
            y: {
                title: {
                    display: true,
                    text: 'Temperature (°C)'
                },
                beginAtZero: true,
                grid: {
                    color: 'rgba(255, 255, 255, 0.05)'
                }
            }
        },
        animation: {
            duration: 0
        },
        plugins: {
            legend: {
                position: 'top',
            },
            tooltip: {
                mode: 'index',
                intersect: false,
                backgroundColor: 'rgba(30, 30, 30, 0.8)',
                titleColor: '#FFFFFF',
                bodyColor: '#CCCCCC',
                borderColor: '#333333',
                borderWidth: 1
            }
        }
    }
});

// Check Serial API support
function checkSerialSupport() {
    // WebSocket didukung di hampir semua browser modern
    document.getElementById('browserSupportCard').style.display = 'none';
    return true;
}

// Connect to Arduino
async function connectToArduino() {
    try {
        // Ambil alamat IP ESP dari input
        const ipAddress = document.getElementById('ipAddress').value;
        wsUrl = `ws://${ipAddress}/ws`;
        
        // Buat koneksi WebSocket
        socket = new WebSocket(wsUrl);
        
        // Setup event handlers
        socket.onopen = function(e) {
            console.log('Connected to ESP via WebSocket');
            document.getElementById('connectButton').textContent = 'Disconnect';
            document.getElementById('connectionStatus').textContent = 'Terhubung';
            document.getElementById('connectionStatus').className = 'status-connected';
            document.getElementById('sensorStatus').textContent = 'Connected';
            document.getElementById('sensorStatus').className = 'status-connected';
            isConnected = true;
        };
        
        socket.onmessage = function(event) {
            processArduinoData(event.data);
        };
        
        socket.onclose = function(event) {
            if (event.wasClean) {
                console.log(`Connection closed cleanly, code=${event.code} reason=${event.reason}`);
            } else {
                console.error('Connection died');
            }
            disconnectFromArduino();
        };
        
        socket.onerror = function(error) {
            console.error(`WebSocket Error: ${error.message}`);
            document.getElementById('connectionStatus').textContent = 'Connection Error';
            document.getElementById('connectionStatus').className = 'status-disconnected';
            disconnectFromArduino();
        };
        
    } catch (error) {
        console.error('Error connecting to ESP:', error);
        document.getElementById('connectionStatus').textContent = 'Connection Error';
        document.getElementById('connectionStatus').className = 'status-disconnected';
    }
}

// Disconnect from Arduino
async function disconnectFromArduino() {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
    }
    
    // Update UI
    document.getElementById('connectButton').textContent = 'Connect';
    document.getElementById('connectionStatus').textContent = 'Tidak Terhubung';
    document.getElementById('connectionStatus').className = 'status-disconnected';
    document.getElementById('sensorStatus').textContent = 'Disconnected';
    document.getElementById('sensorStatus').className = 'status-disconnected';
    isConnected = false;
    
    console.log('Disconnected from ESP');
}

// Read data from Arduino
async function startReadingData() {
    while (port.readable && isConnected) {
        try {
            // Read data until newline
            let dataBuffer = '';
            
            while (true) {
                const { value, done } = await reader.read();
                
                if (done) {
                    break;
                }
                
                // Convert data to string
                const textData = decoder.decode(value);
                dataBuffer += textData;
                
                // Check if complete line has been received
                if (dataBuffer.includes('\n')) {
                    const lines = dataBuffer.split('\n');
                    // Process all lines except the last (which may be incomplete)
                    for (let i = 0; i < lines.length - 1; i++) {
                        processArduinoData(lines[i].trim());
                    }
                    // Save remaining unprocessed data
                    dataBuffer = lines[lines.length - 1];
                }
            }
        } catch (error) {
            console.error('Error reading from Arduino:', error);
            break;
        }
    }
}

// Process data received from Arduino
function processArduinoData(data) {
    console.log('Received from Arduino:', data);
    
    if (data.startsWith('TEMP:')) {
        // Extract temperature value
        const temp = parseFloat(data.substring(5));
        if (!isNaN(temp)) {
            actualTemperature = temp;
            
            // Update display
            updateStatusDisplay(actualTemperature, setPoint - actualTemperature);
            
            // Update chart
            updateChart(simulationTime, setPoint, actualTemperature);
            simulationTime += 0.1;
            
            // Update performance donut
            updatePerformanceDonut(actualTemperature, setPoint);
        }
    } 
    else if (data.startsWith('VOLT:')) {
        // Extract voltage value
        const volts = parseFloat(data.substring(5));
        if (!isNaN(volts)) {
            voltage = volts;
            document.getElementById('voltageValue').textContent = `${voltage.toFixed(0)} mV`;
            document.getElementById('tableSensorVoltage').textContent = `${voltage.toFixed(0)} mV`;
        }
    }
    else if (data.startsWith('ADC:')) {
        // Extract ADC value
        const adc = parseInt(data.substring(4));
        if (!isNaN(adc)) {
            rawADC = adc;
            document.getElementById('adcValue').textContent = rawADC;
        }
    }
    
    // Record data if recording is active
    if (isRecording) {
        const elapsedTime = (Date.now() - recordingStartTime) / 1000;
        const error = setPoint - actualTemperature;
        recordDataPoint(elapsedTime, setPoint, actualTemperature, error, voltage, rawADC);
    }
}

// Send data to Arduino
async function sendDataToArduino(command) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        try {
            socket.send(command);
            console.log('Sent to ESP:', command);
            return true;
        } catch (error) {
            console.error('Error sending data to ESP:', error);
            return false;
        }
    }
    return false;
}

// Toggle connection
function toggleConnection() {
    if (!isConnected) {
        connectToArduino();
    } else {
        disconnectFromArduino();
    }
}

// Start simulation
function startSimulation() {
    // Only start simulation if not already running
    stopSimulation();

    // Start new simulation
    useSimulation = true;
    simulationInterval = setInterval(updateSimulation, 500); // Update every 500ms
    console.log('Simulation started');
}

// Stop simulation
function stopSimulation() {
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
        useSimulation = false;
        console.log('Simulation stopped');
    }
}

// Simulation variables
let temperatureNoise = 0.2;
let temperatureInertia = 50;
let heaterPower = 0;

// Update simulation
function updateSimulation() {
    simulationTime += 0.1;
    
    // Simulate temperature behavior
    simulateTemperatureBehavior();
    
    // Calculate error
    const error = setPoint - actualTemperature;
    
    // Apply control algorithm
    if (useImprovedAlgorithm) {
        // Improved algorithm
        heaterPower += kp * error;
    } else {
        // Standard algorithm
        heaterPower = kp * error;
    }
    
    // Constrain heater power
    heaterPower = Math.max(0, Math.min(255, heaterPower));
    
    // Update chart
    updateChart(simulationTime, setPoint, actualTemperature);
    
    // Update status display
    updateStatusDisplay(actualTemperature, error);
    
    // Update donut chart
    updatePerformanceDonut(actualTemperature, setPoint);
    
    // Simulate voltage and ADC readings
    voltage = actualTemperature * 10 + 500; // mV
    rawADC = Math.round((voltage / 5000) * 1023);
    
    document.getElementById('voltageValue').textContent = `${voltage.toFixed(0)} mV`;
    document.getElementById('tableSensorVoltage').textContent = `${voltage.toFixed(0)} mV`;
    document.getElementById('adcValue').textContent = rawADC;
    
    // Record data if recording is active
    if (isRecording) {
        const elapsedTime = (Date.now() - recordingStartTime) / 1000;
        recordDataPoint(elapsedTime, setPoint, actualTemperature, error, voltage, rawADC);
    }
}

// Simulate temperature behavior
function simulateTemperatureBehavior() {
    // Calculate target temperature based on heater power
    const targetTemperature = 20 + (heaterPower / 255) * 30; // 20-50°C range
    
    // Simulate thermal inertia (delayed response)
    const responseRate = Math.abs(targetTemperature - actualTemperature) / temperatureInertia;
    if (targetTemperature > actualTemperature) {
        actualTemperature += responseRate;
    } else if (targetTemperature < actualTemperature) {
        actualTemperature -= responseRate;
    }
    
    // Add some random noise to simulate real-world conditions
    actualTemperature += (Math.random() * 2 - 1) * temperatureNoise;
    
    // Ensure temperature stays in valid range
    actualTemperature = Math.max(15, Math.min(50, actualTemperature));
}

// Update chart with new data
function updateChart(time, setPoint, actualTemperature) {
    // Add new data points
    temperatureChart.data.labels.push(time.toFixed(1));
    temperatureChart.data.datasets[0].data.push(setPoint);
    temperatureChart.data.datasets[1].data.push(actualTemperature);
    
    // Keep only the last 100 data points
    if (temperatureChart.data.labels.length > 100) {
        temperatureChart.data.labels.shift();
        temperatureChart.data.datasets[0].data.shift();
        temperatureChart.data.datasets[1].data.shift();
    }
    
    // Update chart
    temperatureChart.update();
}

// Update status display
function updateStatusDisplay(actualTemp, error) {
    // Round values for display
    const roundedActual = actualTemp.toFixed(1);
    const roundedError = Math.abs(error).toFixed(1);
    const errorPercent = Math.abs((error / setPoint) * 100).toFixed(0);
    
    // Update header values
    document.getElementById('headerSetPoint').innerHTML = `${setPoint} <span class="success-label">°C</span>`;
    document.getElementById('headerActual').innerHTML = `${roundedActual} <span class="success-label">°C</span>`;
    document.getElementById('headerError').innerHTML = `${errorPercent}% <span class="success-label">°C</span>`;
    
    // Update table values
    document.getElementById('tableSetPoint').textContent = `${setPoint} °C`;
    document.getElementById('tableActual').textContent = `${roundedActual} °C`;
    document.getElementById('tableError').textContent = `${roundedError} °C`;
}

// Update set point
function updateSetPoint() {
    const input = document.getElementById('setPoint');
    setPoint = Math.max(0, Math.min(50, parseFloat(input.value) || 0));
    input.value = setPoint;

    // Update displayed values
    document.getElementById('headerSetPoint').innerHTML = `${setPoint} <span class="success-label">°C</span>`;
    document.getElementById('tableSetPoint').textContent = `${setPoint} °C`;
    
    // Send to Arduino if connected
    if (isConnected) {
        sendDataToArduino(`SET:${setPoint}`);
    }
}

// Update Kp value
function updateKp() {
    const input = document.getElementById('kpValue');
    kp = Math.max(0, parseFloat(input.value) || 0);
    input.value = kp;

    // Send to Arduino if connected
    if (isConnected) {
        sendDataToArduino(`KP:${kp}`);
    }
}

// Toggle sample mode
function updateSampleMode() {
    useImprovedAlgorithm = document.getElementById('sampleModeToggle').checked;
    document.getElementById('sampleModeLabel').textContent = useImprovedAlgorithm ? 'High Precision' : 'Standard';
    
    // Send to Arduino if connected
    if (isConnected) {
        sendDataToArduino(`MODE:${useImprovedAlgorithm ? 'HIGH' : 'STD'}`);
    }
}

// Reset system
function resetSystem() {
    if (confirm('Reset system to default state?')) {
        // Reset values
        setPoint = 25;
        heaterPower = 0;
        document.getElementById('setPoint').value = 25;
        
        // Update displayed values
        document.getElementById('headerSetPoint').innerHTML = `25 <span class="success-label">°C</span>`;
        document.getElementById('tableSetPoint').textContent = '25 °C';
        
        // Send reset command to Arduino if connected
        if (isConnected) {
            sendDataToArduino('RESET:1');
        }
        
        console.log('System reset');
    }
}

// Toggle time options dropdown
function toggleTimeOptions() {
    const timeSelector = document.getElementById('timeSelector');
    timeSelector.classList.toggle('active');
    
    // Close dropdown when clicking elsewhere
    document.addEventListener('click', function closeDropdown(e) {
        if (!timeSelector.contains(e.target)) {
            timeSelector.classList.remove('active');
            document.removeEventListener('click', closeDropdown);
        }
    });
}

// Select time mode
function selectTimeMode(mode) {
    document.getElementById('selectedMode').textContent = mode;
    
    // Close dropdown after selection
    document.getElementById('timeSelector').classList.remove('active');
    
    // Apply selected mode
    if (mode === 'Real Time') {
        // Stop simulation if running
        stopSimulation();
        
        // If connected to Arduino, use real-time data
        if (isConnected) {
            console.log('Switching to real-time data mode');
        }
    } else if (mode === 'Simulation') {
        // Start simulation
        startSimulation();
        console.log('Starting simulation mode');
    }
    
    // Prevent event propagation
    event.stopPropagation();
}

// Calibrate sensor
function calibrateSensor() {
    if (isConnected) {
        sendDataToArduino('CAL:1');
        alert('Calibration started. Please wait...');
    } else {
        alert('Connect to Arduino first to calibrate sensor.');
    }
}

// Reset calibration
function resetCalibration() {
    if (isConnected) {
        sendDataToArduino('CALRESET:1');
        alert('Calibration reset to factory defaults.');
    } else {
        alert('Connect to Arduino first to reset calibration.');
    }
}

// Start recording data
function startRecording() {
    // Clear any existing data
    recordedData = [];
    recordingStartTime = Date.now();
    isRecording = true;

    clearDataTable();
    
    // Update UI
    document.getElementById('startRecordButton').disabled = true;
    document.getElementById('stopRecordButton').disabled = false;
    document.getElementById('recordingStatus').textContent = 'Recording...';
    document.getElementById('recordingStatus').className = 'status-connected';
    document.getElementById('dataPointCount').textContent = '0';
    document.getElementById('downloadCsvButton').disabled = true;
    
    console.log('Data recording started');
}

// Stop recording data
function stopRecording() {
    isRecording = false;
    
    // Update UI
    document.getElementById('startRecordButton').disabled = false;
    document.getElementById('stopRecordButton').disabled = true;
    document.getElementById('recordingStatus').textContent = 'Recording Stopped';
    document.getElementById('recordingStatus').className = 'status-warning';
    document.getElementById('downloadCsvButton').disabled = recordedData.length === 0;
    
    console.log(`Data recording stopped. ${recordedData.length} data points recorded.`);
}

// Record a data point
function recordDataPoint(timestamp, setPoint, actualTemp, error, voltage, rawADC) {
    if (isRecording) {
        const dataPoint = {
            timestamp,
            setPoint,
            actualTemp,
            error,
            voltage,
            rawADC
        };

        recordedData.push(dataPoint);
        
        // Update count in UI
        document.getElementById('dataPointCount').textContent = recordedData.length;

        updateDataTable(dataPoint);
    }
}

// Update data table
function updateDataTable(dataPoint) {
    const tableBody = document.getElementById('recordedDataBody');
    
    // Remove the "No data" message if it exists
    if (tableBody.querySelector('.empty-table-message')) {
        tableBody.innerHTML = '';
    }
    
    // Create new row
    const row = document.createElement('tr');
    
    // Add cells with data
    row.innerHTML = `
        <td>${dataPoint.timestamp.toFixed(1)}</td>
        <td>${dataPoint.setPoint}</td>
        <td>${dataPoint.actualTemp.toFixed(1)}</td>
        <td>${dataPoint.error.toFixed(1)}</td>
        <td>${dataPoint.voltage.toFixed(0)}</td>
        <td>${dataPoint.rawADC}</td>
    `;
    
    // Add to table
    tableBody.appendChild(row);
    
    // Auto-scroll to the bottom to show latest data
    const tableContainer = tableBody.parentElement.parentElement;
    tableContainer.scrollTop = tableContainer.scrollHeight;
    
    // Keep table size manageable - only show last 100 rows in the DOM
    if (tableBody.children.length > 100) {
        tableBody.removeChild(tableBody.children[0]);
    }
}

// Clear the data table
function clearDataTable() {
    const tableBody = document.getElementById('recordedDataBody');
    tableBody.innerHTML = '<tr><td colspan="6" class="empty-table-message">No data recorded yet</td></tr>';
}

// Download CSV
function downloadCSV() {
    if (recordedData.length === 0) {
        alert('No data to download.');
        return;
    }
    
    // Create CSV header
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Time (s),Set Point (°C),Actual Temperature (°C),Error (°C),Voltage (mV),Raw ADC\n";
    
    // Add all data rows
    recordedData.forEach(dataPoint => {
        const row = [
            dataPoint.timestamp.toFixed(1),
            dataPoint.setPoint,
            dataPoint.actualTemp.toFixed(1),
            dataPoint.error.toFixed(1),
            dataPoint.voltage.toFixed(0),
            dataPoint.rawADC
        ].join(",");
        csvContent += row + "\n";
    });
    
    // Create download link and trigger download
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    const now = new Date();
    const fileName = `temperature_data_${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}.csv`;
    
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    console.log(`CSV file downloaded with ${recordedData.length} data points.`);
}

// Show recording help popup
function showRecordingHelp() {
    alert("Recording Data Instructions:\n\n" +
          "1. Click 'Start Recording' to begin collecting data\n" +
          "2. System will record set point, actual temperature, error, voltage, and ADC values\n" +
          "3. Click 'Stop Recording' when finished\n" +
          "4. Click 'Download CSV' to save data to your computer\n\n" +
          "The CSV file can be opened in Excel or other spreadsheet software for analysis.");
}

// Update performance metrics
function updatePerformanceDonut(actualTemp, setPoint) {
    // Calculate performance as percentage of goal reached
    let accuracy = 0;
    if (setPoint > 0) {
        // Calculate how close we are to set point (100% = perfect match)
        accuracy = 100 - Math.min(100, Math.abs((setPoint - actualTemp) / setPoint * 100));
    }
    
    // Update donut chart
    document.getElementById('performanceCircle').setAttribute('stroke-dasharray', `${accuracy} ${100-accuracy}`);
    document.getElementById('donutPerformance').textContent = `${Math.round(accuracy)}%`;
    
    // Update additional metrics
    document.getElementById('accuracyValue').textContent = `${Math.round(accuracy)}%`;
    
    // Calculate stability as a function of how consistent the temperature is
    const stability = Math.max(0, 100 - (Math.abs(actualTemp - lastTemperature) / 0.5 * 100));
    document.getElementById('stabilityValue').textContent = `${Math.round(stability)}%`;
    
    // Calculate noise level
    const noise = Math.abs(actualTemp - lastTemperature) * 10;
    document.getElementById('noiseValue').textContent = `${noise.toFixed(1)}mV`;
    
    // Update sensor status
    const sensorStatusElement = document.getElementById('sensorStatus');
    if (!isConnected && !useSimulation) {
        sensorStatusElement.textContent = 'Disconnected';
        sensorStatusElement.className = 'status-disconnected';
    } else if (Math.abs(setPoint - actualTemp) > setPoint * 0.1) {
        sensorStatusElement.textContent = 'Adjusting';
        sensorStatusElement.className = 'status-warning';
    } else {
        sensorStatusElement.textContent = 'Stable';
        sensorStatusElement.className = 'status-connected';
    }
    
    // Store last temperature for stability calculation
    lastTemperature = actualTemp;
}

// Add this variable at the top of your script
let lastTemperature = 0;

// Add event listeners after DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Check if browser supports Web Serial API
    checkSerialSupport();
    
    // Add event listeners for all interactive elements
    document.getElementById('connectButton').addEventListener('click', toggleConnection);
    document.getElementById('setPointButton').addEventListener('click', updateSetPoint);
    document.getElementById('kpButton').addEventListener('click', updateKp);
    document.getElementById('sampleModeToggle').addEventListener('change', updateSampleMode);
    document.getElementById('emergencyStop').addEventListener('click', resetSystem);
    document.getElementById('startRecordButton').addEventListener('click', startRecording);
    document.getElementById('stopRecordButton').addEventListener('click', stopRecording);
    document.getElementById('downloadCsvButton').addEventListener('click', downloadCSV);
    document.getElementById('helpRecordButton').addEventListener('click', showRecordingHelp);
    document.getElementById('calibrateButton').addEventListener('click', calibrateSensor);
    document.getElementById('resetCalibButton').addEventListener('click', resetCalibration);
    
    // Initialize with default values
    updatePerformanceDonut(0, setPoint);
    
    // Start simulation by default
    startSimulation();
});

// Add status-warning class if it doesn't exist
if (!document.querySelector('style#warningStyle')) {
    const styleElement = document.createElement('style');
    styleElement.id = 'warningStyle';
    styleElement.textContent = `
        .status-warning {
            color: var(--warning-color);
        }
    `;
    document.head.appendChild(styleElement);
}
