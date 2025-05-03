<template>
  <div class="container">
    <template v-if="logedIn == '0'">
      <span>校验登陆信息...</span>
    </template>
    <template v-if="logedIn == '1'">
      <div class="logged">
        <div class="personal">
          <div class="avatar-container" style="width: 48px; height: 48px;">
            <img class="avatar" :src="userInfo.avatar">
          </div>
          <span>{{ userInfo.nickname }}</span>
        </div>
        <div class="data">
          <div class="item">
            <span class="item-label">今日学习</span><span class="item-value">{{ Math.ceil(userInfo.today_study_time / 60) }}</span><span class="item-label"> 分钟</span>
          </div>
          <div class="item">
            <span class="item-label">连续学习</span><span class="item-value">{{ userInfo.study_serial_days }}</span><span class="item-label"> 天</span>
          </div>
        </div>
        <el-button type="primary" @click="logout">Logout</el-button>
      </div>
    </template>
    <template v-if="logedIn == '2'">
      <template v-if="showQrCode">
        <img :src="qrCode" alt="QR Code" />
        <span>请使用得到app扫描登录</span>
      </template>
      <el-button v-else type="primary" @click="getQrCode">Login</el-button>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { sendRequest } from '@/utils/request.js';

const qrCode = ref('');
const showQrCode = ref(false);
const logedIn = ref('');
const userInfo = ref({});

userInfo.value = {
  "nickname": "Leon",
  "avatar": "https://piccdn2.umiwi.com/avatar/iget/26080452-1493078467.jpeg",
  "today_study_time": 660,
  "study_serial_days": 12,
  "is_v": 0,
  "vip_user": {
    "info": "",
    "stat": 0
  },
  "is_teacher": 0,
  "uid_hazy": "w7EJVerpWml1pNJnXOMygvaj4ZLq90",
  "watermark": "0829"
}

logedIn.value = "0"

const getQrCode = async () => {
  await sendRequest('/api/login/deleteLoginInfo', {}, 'POST')
  const res = await sendRequest('/api/login/getLoginQrCode')
  console.log(res)
  qrCode.value = res.qrCode;
  showQrCode.value = true;
  checkLogin();
}

const logout = async () => {
  await sendRequest('/api/login/deleteLoginInfo', {}, 'POST')
  ebookList.value = [];
  logedIn.value = '2';
}

const checkLogin = async () => {
  setTimeout(async () => {
    const res = await sendRequest('/api/login/checkLogin')
    if (res.data.status == 1) {
      console.log('登录成功');
      logedIn.value = '1';
    } else {
      checkLogin();
    }
  }, 1000);
};

const getUserInfo = async () => {
  try {
    const res = await sendRequest('/api/login/getUserInfo')
    if (res.status == 1) {
      logedIn.value = '1';
    } else {
      logedIn.value = '2';
    }
    userInfo.value = res.data;
  } catch (error) {
    setTimeout(async () => {
      await getUserInfo();
    }, 500);
  }
}

onMounted(async () => {
  setTimeout(async () => {
    await getUserInfo();
  }, 500);
})
</script>

<style scoped>
.container {
  padding: 20px;
  overflow: auto;
  height: 100%;
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
  align-items: center;
  gap: 20px;
}

.logged {
  height: 376px;
  width: 180px;
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
  align-items: center;
  gap: 40px;
}

.personal {
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
  align-items: center;
  gap: 20px;
}

.avatar-container {
  display: block;
  position: relative;
}

.avatar-container .avatar {
  width: 100%;
  height: 100%;
  border-radius: 100%;
}

.data {
  display: flex;
  flex-flow: column nowrap;
  justify-content: center;
  align-items: center;
  gap: 10px;
}
.data .item { 
  display: flex;
  flex-flow: row nowrap;
  justify-content: center;
  align-items: flex-end;
  gap: 10px;
}

.data .item .item-label {
  font-size: 14px;
  color: #999;
}
.data .item .item-value {
  font-size: 22px;
  color: #333; 
}
</style>