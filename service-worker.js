self.addEventListener('push', function(event) {

  let data = {
    title: 'Escalas do Louvor',
    body: 'Você tem uma nova atualização.',
    url: '/'
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (error) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/'
    },
    requireInteraction: false
  };

  event.waitUntil(
    self.registration.showNotification(
      data.title || 'Escalas do Louvor',
      options
    )
  );

});


self.addEventListener('notificationclick', function(event) {

  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(function(clientList) {

      for (const client of clientList) {

        if ('focus' in client) {
          client.focus();

          if ('navigate' in client) {
            client.navigate(url);
          }

          return;
        }

      }

      if (clients.openWindow) {
        return clients.openWindow(url);
      }

    })
  );

});
