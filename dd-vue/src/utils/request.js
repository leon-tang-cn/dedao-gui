import axios from 'axios';
const host = import.meta.env.VITE_APP_HOST;

export function sendRequest(url, params, method, data) {
    return new Promise((resolve, reject) => {
        axios({
            url: `${host}${url}`,
            params,
            method: method || 'get',
            data,
            headers: { 'Content-Type': 'application/json' }
        }).then(res => {
            resolve(res.data)
        }).catch(err => {
            if (err.response && err.response.data) {
                reject(err.response.data)
            } else {
                reject(err)
            }
        })
    })
}
export function sendStreamRequest(url, params, method, data) {
    return new Promise((resolve, reject) => {
        axios({
            url: `${host}${url}`,
            params,
            method: method || 'get',
            data,
            responseType: 'blob',
            headers: { 'Content-Type': 'application/json' }
        }).then(res => {
            resolve(res.data)
        }).catch(err => {
            if (err.response && err.response.data) {
                reject(err.response.data)
            } else {
                reject(err)
            }
        })
    })
}