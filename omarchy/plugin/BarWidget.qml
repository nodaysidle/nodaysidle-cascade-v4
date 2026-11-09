import QtQuick
import qs.Ui

BarWidget {
  id: root
  moduleName: "nodaysidle.cascade-v4"

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "C4"
    fontFamily: "JetBrainsMono Nerd Font"
    tooltipText: "Cascade V4 — one idea into five contracts"

    onPressed: function(button) {
      if (!root.bar) return
      if (button === Qt.RightButton) {
        root.bar.run("omarchy-menu summon apps.cascade-v4")
      } else {
        root.bar.run("uwsm-app -- gtk-launch com.nodaysidle.cascade.v4.desktop")
      }
    }
  }
}
