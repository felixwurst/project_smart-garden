const socket = require('socket.io-client')('http://felix.local:5000');
const {log} = require('console');

const Transmitter = require('./modules/transmitter');
const radio = new Transmitter();
radio.setReadingPipe('0xABCDABCD71');
radio.begin();

// [{
//     id: 0,
//     name: "name",
//     sn_number: "0xABCDABCDABCD",
//     user_id: 1,
//     hub_id: 5,
//     connected: 1,
//     requestDataInterval: false,
//     focus: false
// },....]

const hub_info = {
    sn_number: '0xABCDABCD71'
};
socket.on('connect', () => {
    log('connected');
    socket.emit('hub_connect', hub_info);
    // checking all devices every 20 seconds
    setInterval(() => {
        checkAllDevices();
    }, 20 * 1000);
    // saving data to db every 30 minutes
    setInterval(() => {
        requestDataInterval();
    }, 30 * 60 * 1000); 
});

// list of all devices in the cloud
let devices = [];
socket.on('toDevice', receivedDevices => {
    devices = receivedDevices;
    devices.forEach(device => {device.requestDataInterval = false; device.focus = false});
});


let userConnected = false;
socket.on('user_connect', () => {
    userConnected = true;
    log('The user is online now & asking for realtime data');
    // send order to all devices to get realtime data
    // requestRealTimeDataFromAllDevices();
});
socket.on('user_disconnect', () => {
    userConnected = false;
    stopRequestRealTimeDataFromAllDevices();
});


// incoming order for realtime date
socket.on('realTimeRequest', sn => {
    // change focus to true
    devices[devices.map(device => device.sn_number).indexOf(sn)].focus = true;
    radio.send('realTimeData', 10, sn).then(() => {
        log(`realtime data request sent to "${sn}"`);
    }).catch(error => {
        log(error);
    });
});
// stop real time data for some device
socket.on('stopRealTimeData', sn => {
    // change focus to false
    devices[devices.map(device => device.sn_number).indexOf(sn)].focus = false;
    radio.send('stopRealTimeData', 10, sn).then(() => {
        log(`stop realtime data request for device "${sn}"`);
    }).catch(error => {
        log(error);
    })
})


// read the data getting from device
radio.read(data => {
    const sn = data.substr(0, data.indexOf('-'));
    const message = data.substr(data.indexOf('-') + 1, data.length);
    const device = devices.find(device => device.sn_number === sn);
    if (device && message) {
        if (message.toString().replace(/\x00/gi, '') === 'yup') { 
            // device is connected 
            let dev = devices.find(item => item.sn_number === device.sn_number && !item.connected);
            if (dev) {
                // set the device from which the data was received to connected
                dev.connected = 1;
                devices[devices.map(device => device.id).indexOf(device.id)] = dev;
                log(`Device "${device.name}" is connected now`);
                socket.emit('device_connect', device.sn_number);
            }
        } else { 
            // getting sensor data from device
            log(`Message from "${sn}": ${message}`);
            let str = message.replace(/\0/g, '');
            let data = [];
            str.split('|').forEach(d => {
                data.push(d);
            });
            let dev = devices.find(item => item.sn_number === device.sn_number && item.requestDataInterval);
            if (dev) { 
                // sending data to database
                devices[devices.map(device => device.id).indexOf(dev.id)].requestDataInterval = false;
                socket.emit('deviceDataInterval', {device: dev.id, data: data});
                if (!dev.focus) {
                    // stop getting realtime data
                    radio.send('stopRealTimeData', 10, dev.sn_number).then(() => {
                        log(`stop real time data for device "${sn}"`);
                    }).catch(error => {
                        log(error);
                    })
                }
            } else { 
                // sending realtime data
                if (device.focus) {
                    socket.emit('realTimeData', {sn_number: sn, data: data});
                }
            }
        }
    }
}, () => {
    console.log('reading stopped');
});


// check connection for each device connected to this hub
function checkAllDevices() {
    // recursivePromises(0, checkConnected);
    devices.forEach(device => {
        checkConnected(device).then(() => {

        }).catch(error => {
            
        })
    })
}
const checkConnected = device => {
    return new Promise((resolve, reject) => {
        radio.checkConnected('hi', 10, device.sn_number).then(() => {
            let dev = devices.find(item => item.sn_number === device.sn_number && !item.connected);
            if (dev) {
                dev.connected = 1;
                devices[devices.map(device => device.id).indexOf(device.id)] = dev;
                log(`Device "${device.name}" is connected now`);
                socket.emit('device_connect', device.sn_number);
            }
            resolve();
        }).catch(() => {
            let dev = devices.find(item => item.sn_number === device.sn_number && item.connected);
            if (dev) {
                dev.connected = 0;
                devices[devices.map(device => device.id).indexOf(device.id)] = dev;
                log(`Device "${device.name}" is disconnected now`);
                socket.emit('device_disconnect', device.sn_number);
            }
            reject(`Device "${device.name}" is disconnected`);
        });
    });
};


// ???
// interval request data from devices
function requestDataInterval(){
    requestRealTimeDataFromAllDevices();
}
function requestRealTimeDataFromAllDevices() {
    // recursivePromises(0, requestRealTimeData);
    devices.forEach(device => {
        requestRealTimeData(device).then(() => {

        }).catch(error => {

        })
    })
}
function requestRealTimeData(device) {
    return new Promise((resolve, reject) => {
        device.requestDataInterval = true;
        radio.send('realTimeData', 10, device.sn_number).then(() => {
            resolve();
        }).catch(error => {
            log(error);
            reject(error);
        });
    });
}


// stop request realtime data from devices
function stopRequestRealTimeDataFromAllDevices() {
    // recursivePromises(0, stopRequestRealTimeData);
    devices.forEach(device => {
        stopRequestRealTimeData(device).then(() => {

        }).catch(error => {

        })
    })
}
function stopRequestRealTimeData(device) {
    return new Promise((resolve, reject) => {
        radio.send('stopRealTimeData', 10, device.sn_number).then(() => {
            resolve();
        }).catch(error => {
            log(error);
            reject(error);
        });
    });
}


/**
 *
 * @param {*} i
 */
// function recursivePromises(i, promiseToDo) {
//     if (i < devices.length) {
//         const dev = devices[i];
//         i++;
//         promiseToDo(dev).then(() => {
//             recursivePromises(i, promiseToDo);
//         }).catch(error => {
//             // log(error)
//             recursivePromises(i, promiseToDo);
//         });
//     } else {
//         return;
//     }
// }