import NavBar from "@/app/components/navbar";
import Head from 'next/head';
import styles from './about.module.css';

const teamMembers = [
  {
    name: "Evelyn Chen",
    role: "Data Visualization",
    description: "Hello hello! I'm Evelyn (she/her), and I'm from Portland, OR. I love to learn new things and enjoy using my creativity and technical programming experience to build full-stack applications. Aside from computer science, I love rock climbing, all thing outdoors (hiking, catching sunrises/sunsets, running), crafting (birthday cards are so fun!), and taking too many pics on my digital camera.",
    image: "\team_imgs\Evelyn_Chen.jpg",
    socials: {
      linkedin: "https://www.linkedin.com/in/evelynchen5/",
      github: "https://github.com/itsevelync",
    },
  },
  {
    name: "Neil Samant",
    role: "RAG",
    description: "Hey! I'm Neil Samant, a mathematics major at Georgia Tech with a concentration in data science and a minor in computer science. I’m passionate about using tech to solve real-world problems, whether that’s through building full-stack web apps, diving into machine learning projects, or analyzing data to uncover meaningful insights. I’ve worked with tools like Python, Java, JavaScript, SQL, and frameworks like React, Flask, and FastAPI, and I’m always looking to learn something new. Outside of tech, I’m a National Master in chess and have been competing for over 10 years. I love thinking strategically, whether it's on the board or in code.",
    image: "\team_imgs\Neil_Samant.jpeg",
    socials: {
      linkedin: "https://www.linkedin.com/in/neil-samant",
      github: "https://github.com/neilsam19",
    },
  },
  {
    name: "Joe Smith",
    role: "Member",
    description: "Worked on stuffs as well.",
    image: "/team/joe.jpg",
    socials: {
      linkedin: "https://linkedin.com/in/joesmith",
      github: "https://github.com/joesmith",
    },
  },
  {
    name: "Joe Smith",
    role: "Member",
    description: "Worked on stuffs as well.",
    image: "/team/joe.jpg",
    socials: {
      linkedin: "https://linkedin.com/in/joesmith",
      github: "https://github.com/joesmith",
    },
  },
];

export default function AboutUs() {
  return (
    <div className={styles.pageContainer}>
      <Head> {/* Might get rid of montserrat section since it's in global css? */}
        <title>About Us</title>
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;700&display=swap" rel="stylesheet" />
      </Head>
      
      <NavBar />
      
      <main className={styles.mainContent}>
        {/* Hero Section */}
        <section className={styles.heroSection}>
          <h1>About Us</h1>
          <p>SimpliEarn. Lorem sdfslkfjk</p>
        </section>

        {/* Team Section */}
        <section className={styles.teamSection}>
          <h2>Meet the Team</h2>
          <div className={styles.teamGrid}>
            {teamMembers.map((member, index) => (
              <div key={index} className={styles.teamCard}>
                {/* Profile image is currently a square. Might change to circle if preferred */}
                <div className={styles.profileImage}>
                  <img 
                    src={member.image} 
                    alt={member.name} 
                  />
                </div>
                
                {/* Role/tags here instead? */}
                <h3>{member.name}</h3>
                <p className={styles.role}>{member.role}</p>
                <p className={styles.description}>{member.description}</p>
                {/* Social Icons - idk what images to use so there are none rn*/}
                <div className={styles.socialIcons}>
                  {member.socials.linkedin && (
                    <a href={member.socials.linkedin} target="_blank" rel="noopener noreferrer">
                      <img src="/icons/linkedin.svg" alt="LinkedIn" />
                    </a>
                  )}
                  {member.socials.github && (
                    <a href={member.socials.github} target="_blank" rel="noopener noreferrer">
                      <img src="/icons/github.svg" alt="GitHub" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}