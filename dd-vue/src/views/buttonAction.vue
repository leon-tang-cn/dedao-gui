<template>
  <div class="container">
    <span>{{ queryParams }}</span>
    <span>{{ cookieArr }}</span>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { sendRequest } from '@/utils/request.js';
import { ElMessage } from 'element-plus';

const queryParams = ref({});
const cookieArr = ref([]);

const setParams = async () => {
  setTimeout(() => {
    console.log('setParams');
    if (window.electronAPI) {
      const params = window.electronAPI.getParams()
      queryParams.value = params.queryParams;
      cookieArr.value = params.cookieArr;
    } else {
      setParams();
    }
  }, 1000)
}

onMounted(() => {
  setParams();
})
</script>

<style scoped></style>