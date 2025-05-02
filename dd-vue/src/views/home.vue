<template>
  <div class="container">
    <template v-if="logedIn == '1'">
      <el-button type="primary" @click="logout">Logout</el-button>
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
// import { useRouter } from 'vue-router';

// const router = useRouter();

const qrCode = ref('');
const showQrCode = ref(false);
const logedIn = ref('');

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

onMounted(async () => {
  const res = await sendRequest('/api/login/tryGetToken')
  console.log(res)
  if (res.status == 1) {
    logedIn.value = '1';
  } else {
    logedIn.value = '2';
  }
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
</style>