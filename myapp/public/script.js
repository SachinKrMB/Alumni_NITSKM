// Add event listener to each image
document.querySelectorAll('.gallery img').forEach((img) => {
    img.addEventListener('click', () => {
      // Add your desired behavior here (e.g., open larger image, show details)
      console.log('Image clicked!');
    });
  });