const items = {
  stick: {
    name: "Палка",
    isHeld: false,
    toggle: function() {
      this.isHeld = !this.isHeld;
      return this.isHeld;
    },
    getState: function() {
      return this.isHeld;
    }
  }
};

export default items;
