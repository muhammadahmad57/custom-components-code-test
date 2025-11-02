// TODO 5: Implement $mvt global runtime
// This is a global object that should be available to all compiled components

window.$mvt = {
  currentUser: () => ({
    id: "test-user",
    name: "Test User",
  }),
  store: {
    // Your implementation here (localStorage is fine)
    getItem: async (key) => {
      // Implement localStorage get
      const value = localStorage.getItem(key);
      if (value) {
        return JSON.parse(value);
      }
      else {
        return null
      }
    },
    setItem: async (key, value) => {
      // Implement localStorage set
      localStorage.setItem(key, JSON.stringify(value));
    },
  },
}

export default window.$mvt
